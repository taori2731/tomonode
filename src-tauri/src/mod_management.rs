//! Phase M2/M3 persistence and read-only role classification for the Mod
//! management V2 sidecar.
//!
//! This module reads the existing extension folders/manifests, classifies
//! Java Mod artifacts with evidence, and persists a schema-v1 snapshot next
//! to the server.  It does not import packs, launch servers, quarantine
//! files, or copy JARs.  The server's existing files remain the source of
//! truth.

use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{self, Cursor, Read, Seek, Write},
    path::{Path, PathBuf},
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use zip::ZipArchive;

use crate::{
    error::{AppError, AppResult},
    models::ServerProfile,
};

pub const MOD_MANAGEMENT_SCHEMA_VERSION: u32 = 1;

const MAX_METADATA_BYTES: u64 = 2 * 1024 * 1024;
const MAX_NESTED_ARCHIVE_DEPTH: u8 = 2;
const MAX_NESTED_ARCHIVE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_CLASS_SCAN_BYTES: u64 = 8 * 1024 * 1024;

/// The role names are persisted as strings for compatibility with the first
/// sidecar.  Keep this list deliberately small: `unknown` means that the
/// scanner did not find authoritative side information and must not be
/// silently converted into a client or server set.
pub const ROLE_SERVER_ONLY: &str = "server-only";
pub const ROLE_CLIENT_ONLY: &str = "client-only";
pub const ROLE_BOTH: &str = "both";
pub const ROLE_CLIENT_OPTIONAL: &str = "client-optional";
pub const ROLE_UNKNOWN: &str = "unknown";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModManagementTarget {
    #[serde(default = "default_game")]
    pub game: String,
    #[serde(default, alias = "minecraft_version")]
    pub minecraft_version: String,
    #[serde(default)]
    pub loader: String,
    #[serde(
        default,
        alias = "loader_version",
        skip_serializing_if = "Option::is_none"
    )]
    pub loader_version: Option<String>,
    #[serde(default, alias = "java_major")]
    pub java_major: u16,
}

impl Default for ModManagementTarget {
    fn default() -> Self {
        Self {
            game: default_game(),
            minecraft_version: String::new(),
            loader: String::new(),
            loader_version: None,
            java_major: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModManagementDesiredSets {
    #[serde(default)]
    pub server: Vec<String>,
    #[serde(default)]
    pub client: Vec<String>,
    #[serde(default, alias = "optional_client")]
    pub optional_client: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModManagementOrigin {
    pub provider: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version_number: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub dependency: bool,
    /// Relative to the server root; never an absolute host path.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manifest_path: Option<String>,
}

fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModManagementArtifact {
    pub artifact_id: String,
    pub file_name: String,
    pub kind: String,
    pub active: bool,
    #[serde(default)]
    pub present: bool,
    #[serde(default)]
    pub top_level_mods: Vec<serde_json::Value>,
    #[serde(default)]
    pub embedded: Vec<serde_json::Value>,
    /// M2 states default this to unknown; M3 updates it from evidence or a
    /// SHA-256-bound user override.
    #[serde(default = "default_unknown_role")]
    pub role: String,
    #[serde(default)]
    pub role_evidence: Vec<String>,
    #[serde(default)]
    pub dependencies: Vec<serde_json::Value>,
    pub origin: ModManagementOrigin,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientManifestArtifact {
    artifact_id: String,
    sha256: String,
    file_name: String,
    role: String,
    mod_ids: Vec<String>,
    top_level_mods: Vec<serde_json::Value>,
    provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    version_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    version_number: Option<String>,
    acquisition: ClientManifestAcquisition,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientManifestAcquisition {
    provider: String,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    version_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    version_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<String>,
}

fn default_unknown_role() -> String {
    "unknown".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModManagementState {
    #[serde(default = "default_schema_version", alias = "schema_version")]
    pub schema_version: u32,
    #[serde(default, alias = "server_id")]
    pub server_id: String,
    #[serde(default)]
    pub target: ModManagementTarget,
    #[serde(default, alias = "desired_sets")]
    pub desired_sets: ModManagementDesiredSets,
    /// Kept as opaque JSON so legacy/future override records survive refresh.
    #[serde(default, alias = "role_overrides")]
    pub role_overrides: Vec<serde_json::Value>,
    #[serde(default)]
    pub artifacts: Vec<ModManagementArtifact>,
    #[serde(default, alias = "last_successful_launch")]
    pub last_successful_launch: Option<String>,
    #[serde(default, alias = "updated_at")]
    pub updated_at: String,
}

fn default_schema_version() -> u32 {
    MOD_MANAGEMENT_SCHEMA_VERSION
}

fn default_game() -> String {
    "minecraft-java".into()
}

#[derive(Debug, Clone)]
struct ExistingManifest {
    path: PathBuf,
    file_name: String,
    kind: String,
    provider: Option<String>,
    project_id: Option<String>,
    version_id: Option<String>,
    version_number: Option<String>,
    sha256: Option<String>,
    source: Option<String>,
    dependency: bool,
    environment: Option<String>,
    role: Option<String>,
    role_evidence: Vec<String>,
}

#[derive(Debug, Clone)]
struct ObservedArtifact {
    path: PathBuf,
    file_name: String,
    kind: String,
    active: bool,
    artifact_id: Option<String>,
}

#[derive(Debug, Default, Clone)]
struct ArchiveInspection {
    top_level_mods: Vec<serde_json::Value>,
    embedded: Vec<serde_json::Value>,
    dependencies: Vec<serde_json::Value>,
    strong_role: Option<String>,
    strong_role_conflict: bool,
    role_evidence: Vec<String>,
    weak_evidence: Vec<String>,
}

pub fn state_path(profile: &ServerProfile) -> PathBuf {
    Path::new(&profile.root_path)
        .join(".server-hub")
        .join("mod-management")
        .join("state.json")
}

/// Return the existing schema-v1 state.  A missing file is intentionally not
/// an error so callers can choose whether to create it.
pub fn read(profile: &ServerProfile) -> AppResult<Option<ModManagementState>> {
    let path = state_path(profile);
    reject_symlink(&path)?;
    if let Some(parent) = path.parent() {
        reject_symlink(parent)?;
        if let Some(server_hub) = parent.parent() {
            reject_symlink(server_hub)?;
        }
    }
    if !path.is_file() {
        return Ok(None);
    }
    let bytes = fs::read(path)?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err(AppError::Validation(
            "Mod管理状態ファイルが大きすぎます".into(),
        ));
    }
    let mut value: serde_json::Value = serde_json::from_slice(&bytes)?;
    // The first sidecar had no prior schema in released builds.  Treat an
    // omitted version as the legacy shape and project it into V1 without
    // rewriting the file until the caller explicitly refreshes it.
    if value.get("schemaVersion").is_none() && value.get("schema_version").is_none() {
        value["schemaVersion"] = serde_json::json!(MOD_MANAGEMENT_SCHEMA_VERSION);
    }
    let mut state: ModManagementState = serde_json::from_value(value)?;
    validate_state(&mut state, profile)?;
    Ok(Some(state))
}

/// Read the existing state or create the initial V1 snapshot.  Only the new
/// `.server-hub/mod-management/` sidecar is written on first access.
pub fn get_or_create(profile: &ServerProfile) -> AppResult<ModManagementState> {
    if let Some(state) = read(profile)? {
        // M2 states contain the inventory but no archive metadata or role
        // evidence.  Upgrade those states lazily on first access so an
        // existing sidecar remains readable and the expensive ZIP scan stays
        // off the UI thread (the command wrapper uses spawn_blocking).
        if needs_role_refresh(&state) {
            return refresh(profile);
        }
        return Ok(state);
    }
    let state = build_state(profile, None)?;
    write(profile, &state)?;
    Ok(state)
}

/// Re-scan existing folders/manifests and atomically replace the sidecar.
/// User-owned fields that are outside M2's read-only inventory are retained.
pub fn refresh(profile: &ServerProfile) -> AppResult<ModManagementState> {
    let previous = read(profile)?;
    let state = build_state(profile, previous.as_ref())?;
    write(profile, &state)?;
    Ok(state)
}

fn build_state(
    profile: &ServerProfile,
    previous: Option<&ModManagementState>,
) -> AppResult<ModManagementState> {
    let root = Path::new(&profile.root_path);
    let previous_state = previous.cloned();
    let manifests = read_manifests(root)?;
    let mut manifest_by_file = HashMap::<(String, String), ExistingManifest>::new();
    for manifest in manifests {
        let key = (
            manifest.kind.to_ascii_lowercase(),
            manifest.file_name.to_ascii_lowercase(),
        );
        // Deterministically keep the first manifest if a legacy folder has
        // duplicate records for the same file.
        manifest_by_file.entry(key).or_insert(manifest);
    }

    let mut observed = Vec::new();
    for (folder, kind, active) in artifact_folders(profile) {
        observe_folder(&folder, &kind, active, &mut observed)?;
    }

    let mut artifacts = Vec::new();
    let mut consumed_manifests = HashMap::<(String, String), bool>::new();
    for entry in observed {
        let key = (
            entry.kind.to_ascii_lowercase(),
            entry.file_name.to_ascii_lowercase(),
        );
        let manifest = manifest_by_file.get(&key);
        let artifact_id = entry
            .artifact_id
            .clone()
            .or_else(|| manifest.and_then(|item| item.sha256.clone()).map(hash_id));
        let Some(artifact_id) = artifact_id else {
            // Unreadable files are not silently made up as managed artifacts;
            // a later refresh can pick them up once they become readable.
            continue;
        };
        consumed_manifests.insert(key, true);
        artifacts.push(artifact_from_observed(
            entry,
            artifact_id,
            manifest,
            root,
            previous_state.as_ref(),
        ));
    }

    // Preserve an existing manifest even if its file was removed outside the
    // app.  This is useful for explaining old managed records and does not
    // claim that the artifact is present or active.
    for manifest in manifest_by_file.values() {
        let key = (
            manifest.kind.to_ascii_lowercase(),
            manifest.file_name.to_ascii_lowercase(),
        );
        if consumed_manifests.contains_key(&key) {
            continue;
        }
        let Some(hash) = manifest.sha256.clone().map(hash_id) else {
            continue;
        };
        artifacts.push(artifact_from_manifest(
            manifest,
            hash,
            root,
            previous_state.as_ref(),
        ));
    }

    artifacts.sort_by(|left, right| {
        left.kind
            .cmp(&right.kind)
            .then(
                left.file_name
                    .to_ascii_lowercase()
                    .cmp(&right.file_name.to_ascii_lowercase()),
            )
            .then(left.active.cmp(&right.active).reverse())
    });
    let mut server = artifacts
        .iter()
        .filter(|item| {
            item.active
                && item.present
                // Keep unknown active artifacts in the legacy server set so
                // M2/start-preflight compatibility is unchanged.  A
                // client-optional Mod is server-required, while client-only
                // is deliberately excluded.
                && matches!(
                    item.role.as_str(),
                    ROLE_SERVER_ONLY | ROLE_CLIENT_OPTIONAL | ROLE_BOTH | ROLE_UNKNOWN
                )
        })
        .map(|item| item.artifact_id.clone())
        .collect::<Vec<_>>();
    server.sort();
    server.dedup();

    let desired_sets = ModManagementDesiredSets {
        server,
        client: artifacts
            .iter()
            .filter(|item| {
                item.active
                    && item.present
                    && matches!(
                        item.role.as_str(),
                        ROLE_CLIENT_ONLY | ROLE_BOTH | ROLE_CLIENT_OPTIONAL
                    )
            })
            .map(|item| item.artifact_id.clone())
            .collect(),
        optional_client: artifacts
            .iter()
            .filter(|item| item.active && item.present && item.role == ROLE_CLIENT_OPTIONAL)
            .map(|item| item.artifact_id.clone())
            .collect(),
    };
    Ok(ModManagementState {
        schema_version: MOD_MANAGEMENT_SCHEMA_VERSION,
        server_id: profile.id.clone(),
        target: target_from_profile(profile),
        desired_sets,
        role_overrides: previous_state
            .as_ref()
            .map(|state| state.role_overrides.clone())
            .unwrap_or_default(),
        artifacts,
        last_successful_launch: previous_state
            .as_ref()
            .and_then(|state| state.last_successful_launch.clone()),
        updated_at: Utc::now().to_rfc3339(),
    })
}

fn artifact_folders(profile: &ServerProfile) -> Vec<(PathBuf, String, bool)> {
    let root = Path::new(&profile.root_path);
    let mut folders = vec![
        (root.join("mods"), "mod".into(), true),
        (root.join("plugins"), "plugin".into(), true),
        (root.join(".server-hub/disabled/mod"), "mod".into(), false),
        (
            root.join(".server-hub/disabled/plugin"),
            "plugin".into(),
            false,
        ),
        (
            root.join(".server-hub/disabled/datapack"),
            "datapack".into(),
            false,
        ),
    ];
    if safe_world_name(&profile.settings.world_name) {
        folders.insert(
            2,
            (
                root.join(&profile.settings.world_name).join("datapacks"),
                "datapack".into(),
                true,
            ),
        );
    }
    folders
}

fn observe_folder(
    folder: &Path,
    kind: &str,
    active: bool,
    output: &mut Vec<ObservedArtifact>,
) -> AppResult<()> {
    if !folder.is_dir() || fs::symlink_metadata(folder)?.file_type().is_symlink() {
        return Ok(());
    }
    let mut entries = fs::read_dir(folder)?.flatten().collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let path = entry.path();
        let file_type = entry.file_type()?;
        if !file_type.is_file() || !supported_file_name(&path, kind) {
            continue;
        }
        let artifact_id = file_sha256(&path).ok().map(hash_id);
        output.push(ObservedArtifact {
            path,
            file_name: entry.file_name().to_string_lossy().to_string(),
            kind: kind.into(),
            active,
            artifact_id,
        });
    }
    Ok(())
}

fn safe_world_name(value: &str) -> bool {
    !value.is_empty()
        && !value.contains(['/', '\\', '\0'])
        && Path::new(value)
            .components()
            .all(|component| matches!(component, std::path::Component::Normal(_)))
}

fn supported_file_name(path: &Path, kind: &str) -> bool {
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };
    match kind {
        "datapack" => extension.eq_ignore_ascii_case("zip"),
        _ => extension.eq_ignore_ascii_case("jar"),
    }
}

fn artifact_from_observed(
    observed: ObservedArtifact,
    artifact_id: String,
    manifest: Option<&ExistingManifest>,
    root: &Path,
    previous: Option<&ModManagementState>,
) -> ModManagementArtifact {
    let inspection = inspect_archive(&observed.path, &observed.kind);
    let (role, mut role_evidence) = classify_role(
        &artifact_id,
        &observed.file_name,
        manifest,
        &inspection,
        previous,
    );
    role_evidence.extend(inspection.weak_evidence.clone());
    let origin = manifest
        .map(|item| origin_from_manifest(item, root))
        .unwrap_or_else(|| ModManagementOrigin {
            provider: "manual".into(),
            ..ModManagementOrigin::default()
        });
    ModManagementArtifact {
        artifact_id,
        file_name: observed.file_name,
        kind: observed.kind,
        active: observed.active,
        present: true,
        top_level_mods: inspection.top_level_mods,
        embedded: inspection.embedded,
        role,
        role_evidence,
        dependencies: inspection.dependencies,
        origin,
    }
}

fn artifact_from_manifest(
    manifest: &ExistingManifest,
    artifact_id: String,
    root: &Path,
    previous: Option<&ModManagementState>,
) -> ModManagementArtifact {
    let inspection = ArchiveInspection::default();
    let (role, role_evidence) = classify_role(
        &artifact_id,
        &manifest.file_name,
        Some(manifest),
        &inspection,
        previous,
    );
    ModManagementArtifact {
        artifact_id,
        file_name: manifest.file_name.clone(),
        kind: manifest.kind.clone(),
        active: false,
        present: false,
        top_level_mods: inspection.top_level_mods,
        embedded: inspection.embedded,
        role,
        role_evidence,
        dependencies: Vec::new(),
        origin: origin_from_manifest(manifest, root),
    }
}

fn origin_from_manifest(manifest: &ExistingManifest, root: &Path) -> ModManagementOrigin {
    let provider = manifest
        .provider
        .clone()
        .or_else(|| {
            manifest.source.as_deref().and_then(|source| {
                (source.eq_ignore_ascii_case("local-file") || source.eq_ignore_ascii_case("manual"))
                    .then_some("manual".into())
            })
        })
        .unwrap_or_else(|| "manual".into());
    let manifest_path = manifest
        .path
        .strip_prefix(root)
        .ok()
        .map(|path| path.to_string_lossy().replace('\\', "/"));
    ModManagementOrigin {
        provider,
        project_id: manifest.project_id.clone(),
        version_id: manifest.version_id.clone(),
        version_number: manifest.version_number.clone(),
        source: manifest.source.clone(),
        dependency: manifest.dependency,
        manifest_path,
    }
}

fn read_manifests(root: &Path) -> AppResult<Vec<ExistingManifest>> {
    let folder = root.join(".server-hub/extension-manifests");
    if !folder.is_dir() || fs::symlink_metadata(&folder)?.file_type().is_symlink() {
        return Ok(Vec::new());
    }
    let mut files = fs::read_dir(folder)?.flatten().collect::<Vec<_>>();
    files.sort_by_key(|entry| entry.file_name());
    let mut manifests = Vec::new();
    for entry in files {
        if !entry.file_type()?.is_file()
            || entry
                .path()
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| !value.eq_ignore_ascii_case("json"))
                .unwrap_or(true)
        {
            continue;
        }
        let bytes = fs::read(entry.path())?;
        let value: serde_json::Value = match serde_json::from_slice(&bytes) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let Some(file_name) = value
            .get("fileName")
            .or_else(|| value.get("filename"))
            .or_else(|| value.get("file_name"))
            .and_then(serde_json::Value::as_str)
            .map(str::to_string)
        else {
            continue;
        };
        let kind = value
            .get("kind")
            .or_else(|| value.get("type"))
            .or_else(|| value.get("extensionKind"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("mod")
            .to_string();
        let provider = string_field(&value, &["provider"]);
        let source = string_field(&value, &["source", "origin"]);
        manifests.push(ExistingManifest {
            path: entry.path(),
            file_name,
            kind,
            provider,
            project_id: string_field(&value, &["projectId", "project_id"]),
            version_id: string_field(&value, &["versionId", "version_id"]),
            version_number: string_field(&value, &["versionNumber", "version_number"]),
            sha256: string_field(&value, &["sha256", "sha-256", "hash"]).and_then(normalize_hash),
            source,
            dependency: value
                .get("dependency")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false),
            environment: value
                .get("environment")
                .or_else(|| value.get("side"))
                .and_then(value_to_string),
            role: value
                .get("role")
                .or_else(|| value.get("modRole"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_string)
                .or_else(|| {
                    value
                        .get("clientOnly")
                        .or_else(|| value.get("client_only"))
                        .and_then(serde_json::Value::as_bool)
                        .filter(|value| *value)
                        .map(|_| ROLE_CLIENT_ONLY.into())
                })
                .or_else(|| {
                    value
                        .get("serverOnly")
                        .or_else(|| value.get("server_only"))
                        .and_then(serde_json::Value::as_bool)
                        .filter(|value| *value)
                        .map(|_| ROLE_SERVER_ONLY.into())
                }),
            role_evidence: value
                .get("roleEvidence")
                .or_else(|| value.get("role_evidence"))
                .and_then(serde_json::Value::as_array)
                .map(|values| {
                    values
                        .iter()
                        .filter_map(serde_json::Value::as_str)
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default(),
        });
    }
    Ok(manifests)
}

fn string_field(value: &serde_json::Value, names: &[&str]) -> Option<String> {
    names
        .iter()
        .find_map(|name| value.get(*name).and_then(serde_json::Value::as_str))
        .map(str::to_string)
}

fn value_to_string(value: &serde_json::Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_string)
        .or_else(|| value.as_bool().map(|item| item.to_string()))
        .or_else(|| {
            value.as_array().map(|values| {
                values
                    .iter()
                    .filter_map(serde_json::Value::as_str)
                    .collect::<Vec<_>>()
                    .join(",")
            })
        })
}

fn normalize_hash(value: String) -> Option<String> {
    let value = value.trim().to_ascii_lowercase();
    (value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())).then_some(value)
}

fn hash_id(value: String) -> String {
    format!("sha256:{value}")
}

fn file_sha256(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut digest = Sha256::new();
    io::copy(&mut file, &mut digest_writer(&mut digest))?;
    Ok(hex::encode(digest.finalize()))
}

fn needs_role_refresh(state: &ModManagementState) -> bool {
    state.artifacts.iter().any(|artifact| {
        artifact.kind == "mod"
            && artifact.present
            && artifact.top_level_mods.is_empty()
            && artifact.embedded.is_empty()
            && artifact.role_evidence.is_empty()
    })
}

fn inspect_archive(path: &Path, kind: &str) -> ArchiveInspection {
    if !kind.eq_ignore_ascii_case("mod")
        || !path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("jar"))
    {
        return ArchiveInspection::default();
    }
    let Ok(file) = File::open(path) else {
        return ArchiveInspection {
            weak_evidence: weak_filename_evidence(path),
            ..ArchiveInspection::default()
        };
    };
    let Ok(mut archive) = ZipArchive::new(file) else {
        return ArchiveInspection {
            weak_evidence: weak_filename_evidence(path),
            ..ArchiveInspection::default()
        };
    };
    let mut inspection = inspect_zip(&mut archive, 0, "");
    inspection
        .weak_evidence
        .extend(weak_filename_evidence(path));
    inspection
}

fn inspect_zip<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    depth: u8,
    path_prefix: &str,
) -> ArchiveInspection {
    let mut metadata = inspect_zip_metadata(archive);
    if depth == 0 {
        metadata.weak_evidence.extend(weak_class_evidence(archive));
    }
    if depth >= MAX_NESTED_ARCHIVE_DEPTH {
        return metadata;
    }

    let nested_names = archive
        .file_names()
        .filter(|name| {
            name.starts_with("META-INF/jarjar/") && name.to_ascii_lowercase().ends_with(".jar")
        })
        .map(str::to_string)
        .collect::<Vec<_>>();
    for nested_name in nested_names {
        let Ok(mut entry) = archive.by_name(&nested_name) else {
            continue;
        };
        if entry.size() > MAX_NESTED_ARCHIVE_BYTES {
            continue;
        }
        let mut bytes = Vec::with_capacity(entry.size().min(MAX_NESTED_ARCHIVE_BYTES) as usize);
        if entry.read_to_end(&mut bytes).is_err() {
            continue;
        }
        let Ok(mut nested) = ZipArchive::new(Cursor::new(bytes)) else {
            continue;
        };
        let nested_prefix = if path_prefix.is_empty() {
            nested_name.clone()
        } else {
            format!("{path_prefix}/{nested_name}")
        };
        let nested_metadata = inspect_zip(&mut nested, depth + 1, &nested_prefix);
        let ids = nested_metadata
            .top_level_mods
            .iter()
            .filter_map(|item| item.get("id").and_then(serde_json::Value::as_str))
            .map(str::to_string)
            .collect::<Vec<_>>();
        if !ids.is_empty() {
            metadata.embedded.push(serde_json::json!({
                "path": nested_prefix,
                "ids": unique_strings(ids),
                "relationship": "bundled"
            }));
        }
        metadata.embedded.extend(nested_metadata.embedded);
        metadata.dependencies.extend(nested_metadata.dependencies);
    }
    metadata.embedded = unique_json_objects(metadata.embedded);
    metadata.dependencies = unique_json_objects(metadata.dependencies);
    metadata
}

fn inspect_zip_metadata<R: Read + Seek>(archive: &mut ZipArchive<R>) -> ArchiveInspection {
    if let Some(value) = read_zip_text(archive, "fabric.mod.json", MAX_METADATA_BYTES) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&value) {
            return inspect_fabric_metadata(&json);
        }
    }
    for name in ["META-INF/mods.toml", "META-INF/neoforge.mods.toml"] {
        if let Some(value) = read_zip_text(archive, name, MAX_METADATA_BYTES) {
            return inspect_forge_metadata(&value);
        }
    }
    ArchiveInspection::default()
}

fn inspect_fabric_metadata(json: &serde_json::Value) -> ArchiveInspection {
    let mut output = ArchiveInspection::default();
    let Some(id) = json.get("id").and_then(serde_json::Value::as_str) else {
        return output;
    };
    let version = json.get("version").and_then(value_to_string);
    let mut mod_value = serde_json::Map::new();
    mod_value.insert("id".into(), serde_json::Value::String(id.into()));
    if let Some(version) = version {
        mod_value.insert("version".into(), serde_json::Value::String(version));
    }
    output
        .top_level_mods
        .push(serde_json::Value::Object(mod_value));

    if let Some(environment) = json.get("environment").and_then(value_to_string) {
        if let Some((role, evidence)) = role_from_environment(&environment, "fabric-environment") {
            merge_strong_role(
                &mut output.strong_role,
                role,
                &mut output.role_evidence,
                &mut output.strong_role_conflict,
            );
            output.role_evidence.push(evidence);
        }
    }
    if explicit_role_fields(json, &mut output) {
        // Explicit clientOnly/serverOnly fields outrank Fabric's environment.
        // `explicit_role_fields` has already inserted the evidence and role;
        // leave both records visible for diagnostics.
    }
    if let Some(depends) = json.get("depends").and_then(serde_json::Value::as_object) {
        for (dependency, range) in depends {
            if matches!(dependency.as_str(), "minecraft" | "java" | "fabricloader") {
                continue;
            }
            output.dependencies.push(serde_json::json!({
                "id": dependency,
                "required": true,
                "versionRange": value_to_string(range).unwrap_or_default()
            }));
        }
    }
    output
}

#[derive(Copy, Clone, Eq, PartialEq)]
enum ForgeSection {
    Other,
    Mods,
    Dependency,
}

fn inspect_forge_metadata(value: &str) -> ArchiveInspection {
    let mut output = ArchiveInspection::default();
    let mut section = ForgeSection::Other;
    let mut current_mod: Option<serde_json::Map<String, serde_json::Value>> = None;
    let mut current_dependency: Option<serde_json::Map<String, serde_json::Value>> = None;

    let flush_mod = |current_mod: &mut Option<serde_json::Map<String, serde_json::Value>>,
                     output: &mut ArchiveInspection| {
        let Some(mut item) = current_mod.take() else {
            return;
        };
        let role = item
            .get("side")
            .and_then(serde_json::Value::as_str)
            .and_then(|side| role_from_side(side, "forge-metadata-side"));
        if let Some(role) = role {
            merge_strong_role(
                &mut output.strong_role,
                role.0,
                &mut output.role_evidence,
                &mut output.strong_role_conflict,
            );
            output.role_evidence.push(role.1);
        }
        if let Some(client_only) = item.get("clientOnly").and_then(serde_json::Value::as_bool) {
            if client_only {
                set_explicit_role(
                    &mut output.strong_role,
                    ROLE_CLIENT_ONLY.into(),
                    &mut output.role_evidence,
                    &mut output.strong_role_conflict,
                    "strong:explicit-client-only",
                );
            }
        }
        item.remove("side");
        item.remove("clientOnly");
        output.top_level_mods.push(serde_json::Value::Object(item));
    };
    let flush_dependency = |current_dependency: &mut Option<
        serde_json::Map<String, serde_json::Value>,
    >,
                            output: &mut ArchiveInspection| {
        if let Some(item) = current_dependency.take() {
            let required = item
                .get("required")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(true);
            let side = item
                .get("side")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("BOTH");
            if item.get("id").is_some() {
                output.dependencies.push(serde_json::json!({
                    "id": item.get("id").cloned().unwrap_or(serde_json::Value::Null),
                    "required": required,
                    "side": side,
                    "versionRange": item.get("versionRange").cloned().unwrap_or(serde_json::Value::Null)
                }));
            }
        }
    };

    for raw_line in value.lines() {
        let line = raw_line.split('#').next().unwrap_or_default().trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with("[[mods]]") || line.starts_with("[mods]") {
            flush_dependency(&mut current_dependency, &mut output);
            flush_mod(&mut current_mod, &mut output);
            section = ForgeSection::Mods;
            current_mod = Some(serde_json::Map::new());
            continue;
        }
        if line.starts_with("[[dependencies.") || line.starts_with("[dependencies.") {
            flush_mod(&mut current_mod, &mut output);
            flush_dependency(&mut current_dependency, &mut output);
            section = ForgeSection::Dependency;
            current_dependency = Some(serde_json::Map::new());
            continue;
        }
        if line.starts_with('[') {
            flush_dependency(&mut current_dependency, &mut output);
            flush_mod(&mut current_mod, &mut output);
            section = ForgeSection::Other;
            continue;
        }
        let Some((key, raw_value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let Some(value) = toml_scalar(raw_value) else {
            continue;
        };
        match section {
            ForgeSection::Mods => {
                let item = current_mod.get_or_insert_with(serde_json::Map::new);
                match key {
                    "modId" => {
                        item.insert("id".into(), serde_json::Value::String(value));
                    }
                    "version" => {
                        item.insert("version".into(), serde_json::Value::String(value));
                    }
                    "side" => {
                        item.insert("side".into(), serde_json::Value::String(value));
                    }
                    "clientOnly" | "client_only" => {
                        item.insert(
                            "clientOnly".into(),
                            serde_json::Value::Bool(value.eq_ignore_ascii_case("true")),
                        );
                    }
                    _ => {}
                }
            }
            ForgeSection::Dependency => {
                let item = current_dependency.get_or_insert_with(serde_json::Map::new);
                match key {
                    "modId" => {
                        item.insert("id".into(), serde_json::Value::String(value));
                    }
                    "mandatory" => {
                        item.insert(
                            "required".into(),
                            serde_json::Value::Bool(value.eq_ignore_ascii_case("true")),
                        );
                    }
                    "side" => {
                        item.insert("side".into(), serde_json::Value::String(value));
                    }
                    "versionRange" => {
                        item.insert("versionRange".into(), serde_json::Value::String(value));
                    }
                    _ => {}
                }
            }
            ForgeSection::Other => {
                if matches!(key, "clientOnly" | "client_only") && value.eq_ignore_ascii_case("true")
                {
                    set_explicit_role(
                        &mut output.strong_role,
                        ROLE_CLIENT_ONLY.into(),
                        &mut output.role_evidence,
                        &mut output.strong_role_conflict,
                        "strong:explicit-client-only",
                    );
                }
            }
        }
    }
    flush_dependency(&mut current_dependency, &mut output);
    flush_mod(&mut current_mod, &mut output);
    output
}

fn read_zip_text<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    name: &str,
    max: u64,
) -> Option<String> {
    let mut entry = archive.by_name(name).ok()?;
    if entry.size() > max {
        return None;
    }
    let mut text = String::new();
    entry.read_to_string(&mut text).ok()?;
    Some(text)
}

fn toml_scalar(value: &str) -> Option<String> {
    let value = value.trim();
    if value.eq_ignore_ascii_case("true") || value.eq_ignore_ascii_case("false") {
        return Some(value.to_string());
    }
    if value.len() >= 2
        && ((value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\'')))
    {
        return Some(value[1..value.len() - 1].to_string());
    }
    None
}

fn role_from_environment(environment: &str, prefix: &str) -> Option<(String, String)> {
    let normalized = environment
        .trim()
        .to_ascii_lowercase()
        .replace('-', "_")
        .replace(' ', "_");
    let role = match normalized.as_str() {
        "client" | "client_only" | "singleplayer_only" => ROLE_CLIENT_ONLY,
        "server" | "server_only" | "dedicated_server" => ROLE_SERVER_ONLY,
        "server_only_client_optional" | "server_required_client_optional" => ROLE_CLIENT_OPTIONAL,
        "*"
        | "both"
        | "client_and_server"
        | "client_server"
        | "server_and_client"
        | "server_or_client"
        | "client_or_server"
        | "client_or_server_prefers_both" => ROLE_BOTH,
        _ => return None,
    };
    Some((role.into(), format!("strong:{prefix}-{}", normalized)))
}

fn role_from_side(side: &str, prefix: &str) -> Option<(String, String)> {
    let normalized = side.trim().to_ascii_lowercase().replace('-', "_");
    let role = match normalized.as_str() {
        "client" | "client_only" => ROLE_CLIENT_ONLY,
        "server" | "server_only" | "dedicated_server" => ROLE_SERVER_ONLY,
        "both" | "client_and_server" | "client_server" | "*" => ROLE_BOTH,
        _ => return None,
    };
    Some((role.into(), format!("strong:{prefix}-{}", normalized)))
}

fn explicit_role_fields(json: &serde_json::Value, inspection: &mut ArchiveInspection) -> bool {
    let client_only = json
        .get("clientOnly")
        .or_else(|| json.get("client_only"))
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    let server_only = json
        .get("serverOnly")
        .or_else(|| json.get("server_only"))
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    if client_only == server_only {
        return false;
    }
    let role = if client_only {
        ROLE_CLIENT_ONLY
    } else {
        ROLE_SERVER_ONLY
    };
    set_explicit_role(
        &mut inspection.strong_role,
        role.into(),
        &mut inspection.role_evidence,
        &mut inspection.strong_role_conflict,
        if client_only {
            "strong:explicit-client-only"
        } else {
            "strong:explicit-server-only"
        },
    );
    true
}

fn set_explicit_role(
    current: &mut Option<String>,
    role: String,
    evidence: &mut Vec<String>,
    conflict: &mut bool,
    reason: &str,
) {
    if *conflict {
        return;
    }
    *current = Some(role);
    evidence.push(reason.into());
}

fn merge_strong_role(
    current: &mut Option<String>,
    candidate: String,
    evidence: &mut Vec<String>,
    conflict: &mut bool,
) {
    if *conflict {
        return;
    }
    if current.as_deref().is_none() {
        *current = Some(candidate);
    } else if current.as_deref() != Some(candidate.as_str()) {
        // Conflicting strong declarations are safer as unknown than as a
        // guessed side.  Keep an explicit diagnostic for the UI.  The
        // conflict flag is sticky so a later third signal cannot restore a
        // role after the metadata has contradicted itself.
        *current = None;
        *conflict = true;
        if !evidence
            .iter()
            .any(|item| item == "strong:metadata-role-conflict")
        {
            evidence.push("strong:metadata-role-conflict".into());
        }
    }
}

fn weak_filename_evidence(path: &Path) -> Vec<String> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let tokens = [
        "client", "hud", "minimap", "sodium", "iris", "shader", "zoom",
    ];
    tokens
        .iter()
        .filter(|token| name.contains(**token))
        .map(|token| format!("weak:filename-{token}-token"))
        .collect()
}

fn weak_class_evidence<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Vec<String> {
    let mut evidence = Vec::new();
    let names = archive
        .file_names()
        .filter(|name| name.to_ascii_lowercase().ends_with(".class"))
        .map(str::to_string)
        .collect::<Vec<_>>();
    for name in names {
        let Ok(mut entry) = archive.by_name(&name) else {
            continue;
        };
        if entry.size() > MAX_CLASS_SCAN_BYTES {
            continue;
        }
        let mut bytes = Vec::with_capacity(entry.size().min(MAX_CLASS_SCAN_BYTES) as usize);
        if entry.read_to_end(&mut bytes).is_err() {
            continue;
        }
        if bytes
            .windows(b"net/minecraft/client".len())
            .any(|window| window == b"net/minecraft/client")
        {
            evidence.push("weak:class-client-reference".into());
            break;
        }
        let lowered = bytes
            .iter()
            .map(|value| value.to_ascii_lowercase())
            .collect::<Vec<_>>();
        if lowered
            .windows(b"client-only".len())
            .any(|window| window == b"client-only")
        {
            evidence.push("weak:class-client-only-string".into());
            break;
        }
    }
    evidence
}

fn unique_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    values
        .into_iter()
        .filter(|value| seen.insert(value.to_ascii_lowercase()))
        .collect()
}

fn unique_json_objects(values: Vec<serde_json::Value>) -> Vec<serde_json::Value> {
    let mut seen = std::collections::HashSet::new();
    values
        .into_iter()
        .filter(|value| {
            let key = serde_json::to_string(value).unwrap_or_default();
            seen.insert(key)
        })
        .collect()
}

fn classify_role(
    artifact_id: &str,
    file_name: &str,
    manifest: Option<&ExistingManifest>,
    inspection: &ArchiveInspection,
    previous: Option<&ModManagementState>,
) -> (String, Vec<String>) {
    let mut evidence = Vec::new();
    if let Some((role, reason)) =
        previous.and_then(|state| role_override_for(state, artifact_id, file_name))
    {
        evidence.push("strong:user-override".into());
        if !reason.is_empty() {
            evidence.push(format!("strong:user-override-reason:{reason}"));
        }
        return (role, evidence);
    }
    if let Some(manifest) = manifest {
        if let Some(role) = manifest_role(manifest) {
            evidence.extend(if manifest.role_evidence.is_empty() {
                vec![format!("strong:manifest-role-{}", role.replace('-', "_"))]
            } else {
                manifest.role_evidence.clone()
            });
            return (role, evidence);
        }
    }
    if let Some(role) = inspection.strong_role.clone() {
        evidence.extend(inspection.role_evidence.clone());
        return (role, evidence);
    }
    if let Some(previous_artifact) = previous.and_then(|state| {
        state
            .artifacts
            .iter()
            .find(|item| item.artifact_id.eq_ignore_ascii_case(artifact_id))
    }) {
        if previous_artifact.role != ROLE_UNKNOWN
            && previous_artifact
                .role_evidence
                .iter()
                .any(|item| item.contains("user-override") || item.starts_with("override:"))
        {
            evidence.extend(previous_artifact.role_evidence.clone());
            return (previous_artifact.role.clone(), evidence);
        }
    }
    if inspection.role_evidence.is_empty() {
        evidence.push("weak:role-unresolved".into());
    } else {
        evidence.extend(inspection.role_evidence.clone());
    }
    (ROLE_UNKNOWN.into(), evidence)
}

fn manifest_role(manifest: &ExistingManifest) -> Option<String> {
    if let Some(role) = manifest.role.as_deref().and_then(normalize_role) {
        return Some(role);
    }
    manifest
        .environment
        .as_deref()
        .and_then(|environment| role_from_environment(environment, "modrinth-manifest-environment"))
        .map(|(role, _)| role)
}

fn normalize_role(value: &str) -> Option<String> {
    let normalized = value
        .trim()
        .to_ascii_lowercase()
        .replace('-', "_")
        .replace(' ', "_");
    match normalized.as_str() {
        "server" | "server_only" => Some(ROLE_SERVER_ONLY.into()),
        "client" | "client_only" => Some(ROLE_CLIENT_ONLY.into()),
        "both" | "client_and_server" | "client_server" | "server_and_client" => {
            Some(ROLE_BOTH.into())
        }
        "client_optional"
        | "optional_client"
        | "server_only_client_optional"
        | "server_required_client_optional" => Some(ROLE_CLIENT_OPTIONAL.into()),
        // `unknown` is an absence of evidence, not an authoritative
        // declaration.  Let a stronger archive/provider signal win.
        "unknown" => None,
        _ => None,
    }
}

fn normalize_override_role(value: &str) -> Option<String> {
    if value.trim().eq_ignore_ascii_case(ROLE_UNKNOWN) {
        Some(ROLE_UNKNOWN.into())
    } else {
        normalize_role(value)
    }
}

fn role_override_for(
    state: &ModManagementState,
    artifact_id: &str,
    file_name: &str,
) -> Option<(String, String)> {
    state.role_overrides.iter().find_map(|value| {
        let object = value.as_object()?;
        let identity = object
            .get("artifactId")
            .or_else(|| object.get("artifact_id"))
            .or_else(|| object.get("sha256"))
            .or_else(|| object.get("id"))
            .and_then(serde_json::Value::as_str);
        let matches = identity.is_some_and(|value| {
            value.eq_ignore_ascii_case(artifact_id)
                || value.eq_ignore_ascii_case(file_name)
                || (value.len() == 64
                    && artifact_id
                        .strip_prefix("sha256:")
                        .is_some_and(|hash| value.eq_ignore_ascii_case(hash)))
        });
        if !matches {
            return None;
        }
        let role = object
            .get("role")
            .and_then(serde_json::Value::as_str)
            .and_then(normalize_override_role)?;
        let reason = object
            .get("reason")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .chars()
            .take(120)
            .collect::<String>();
        Some((role, reason))
    })
}

/// Persist a user decision in the V1 sidecar and immediately reclassify the
/// inventory.  The override is keyed by the content hash, so replacing a JAR
/// does not silently inherit an old decision.
pub fn set_role_override(
    profile: &ServerProfile,
    artifact_id: String,
    role: String,
    reason: Option<String>,
) -> AppResult<ModManagementState> {
    let artifact_id = artifact_id.trim().to_ascii_lowercase();
    if !artifact_id.starts_with("sha256:")
        || artifact_id.len() != "sha256:".len() + 64
        || !artifact_id["sha256:".len()..]
            .bytes()
            .all(|value| value.is_ascii_hexdigit())
    {
        return Err(AppError::Validation(
            "Modの分類上書き対象が正しくありません".into(),
        ));
    }
    let role = normalize_override_role(&role).ok_or_else(|| {
        AppError::Validation("Modの分類はserver-only／client-only／both／client-optional／unknownから選択してください".into())
    })?;
    let reason = reason
        .unwrap_or_default()
        .chars()
        .filter(|value| !value.is_control())
        .take(240)
        .collect::<String>();
    let mut state = read(profile)?.unwrap_or(build_state(profile, None)?);
    state.role_overrides.retain(|value| {
        !value
            .get("artifactId")
            .or_else(|| value.get("artifact_id"))
            .or_else(|| value.get("sha256"))
            .or_else(|| value.get("id"))
            .and_then(serde_json::Value::as_str)
            .is_some_and(|value| {
                value.eq_ignore_ascii_case(&artifact_id)
                    || (value.len() == 64
                        && artifact_id
                            .strip_prefix("sha256:")
                            .is_some_and(|hash| value.eq_ignore_ascii_case(hash)))
            })
    });
    state.role_overrides.push(serde_json::json!({
        "artifactId": artifact_id,
        "role": role,
        "reason": if reason.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(reason) },
        "updatedAt": Utc::now().to_rfc3339()
    }));
    write(profile, &state)?;
    refresh(profile)
}

/// Export only a client-facing JSON manifest.  It deliberately contains no
/// host paths, credentials, URLs from local paths, or JAR bytes.  Unknown
/// artifacts are listed separately as unresolved and are never promoted into
/// the client set automatically.
pub fn export_client_manifest(profile: &ServerProfile, destination: &Path) -> AppResult<usize> {
    validate_client_manifest_destination(destination)?;
    let state = get_or_create(profile)?;
    let mut artifacts = Vec::new();
    let mut unresolved = Vec::new();
    for artifact in &state.artifacts {
        if artifact.kind != "mod" || !artifact.active || !artifact.present {
            continue;
        }
        if matches!(
            artifact.role.as_str(),
            ROLE_CLIENT_ONLY | ROLE_BOTH | ROLE_CLIENT_OPTIONAL
        ) {
            artifacts.push(client_manifest_artifact(artifact));
        } else if artifact.role == ROLE_UNKNOWN {
            unresolved.push(client_manifest_artifact(artifact));
        }
    }
    let document = serde_json::json!({
        "schemaVersion": 1,
        "generatedAt": Utc::now().to_rfc3339(),
        "target": state.target,
        "artifacts": artifacts,
        "unresolved": unresolved,
        "notice": "このJSONは取得情報だけを含み、JAR自体・絶対パス・秘密情報は含みません。unresolvedはユーザー確認が必要です。"
    });
    let bytes = serde_json::to_vec_pretty(&document)?;
    write_bytes_atomically(destination, &bytes)?;
    Ok(document
        .get("artifacts")
        .and_then(serde_json::Value::as_array)
        .map_or(0, Vec::len))
}

fn validate_client_manifest_destination(destination: &Path) -> AppResult<()> {
    if destination.as_os_str().is_empty() || !destination.is_absolute() {
        return Err(AppError::Validation(
            "クライアント用マニフェストの保存先は絶対パスで指定してください".into(),
        ));
    }
    if !destination
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("json"))
    {
        return Err(AppError::Validation(
            "クライアント用マニフェストの保存先は.jsonファイルにしてください".into(),
        ));
    }
    let parent = destination.parent().ok_or_else(|| {
        AppError::Validation("クライアント用マニフェストの保存先が正しくありません".into())
    })?;
    if !parent.is_dir() {
        return Err(AppError::Validation(
            "クライアント用マニフェストの親フォルダーが存在しません".into(),
        ));
    }
    reject_symlink(parent)?;
    reject_symlink(destination)?;
    if destination.is_dir() {
        return Err(AppError::Validation(
            "クライアント用マニフェストの保存先がフォルダーです".into(),
        ));
    }
    Ok(())
}

fn write_bytes_atomically(destination: &Path, bytes: &[u8]) -> AppResult<()> {
    let parent = destination.parent().ok_or_else(|| {
        AppError::Validation("クライアント用マニフェストの保存先が正しくありません".into())
    })?;
    let temporary = parent.join(format!(".client-manifest.tmp-{}", Uuid::new_v4()));
    let result = (|| -> AppResult<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        atomic_replace(&temporary, destination)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn client_manifest_artifact(artifact: &ModManagementArtifact) -> ClientManifestArtifact {
    let sha256 = artifact
        .artifact_id
        .strip_prefix("sha256:")
        .unwrap_or(&artifact.artifact_id)
        .to_string();
    let mod_ids = artifact
        .top_level_mods
        .iter()
        .filter_map(|item| item.get("id").and_then(serde_json::Value::as_str))
        .map(str::to_string)
        .collect::<Vec<_>>();
    let method = if artifact.origin.provider.eq_ignore_ascii_case("modrinth") {
        "provider-download"
    } else {
        "manual-reference"
    };
    ClientManifestArtifact {
        artifact_id: artifact.artifact_id.clone(),
        sha256,
        file_name: artifact.file_name.clone(),
        role: artifact.role.clone(),
        mod_ids,
        top_level_mods: artifact.top_level_mods.clone(),
        provider: artifact.origin.provider.clone(),
        project_id: artifact.origin.project_id.clone(),
        version_id: artifact.origin.version_id.clone(),
        version_number: artifact.origin.version_number.clone(),
        acquisition: ClientManifestAcquisition {
            provider: artifact.origin.provider.clone(),
            method: method.into(),
            project_id: artifact.origin.project_id.clone(),
            version_id: artifact.origin.version_id.clone(),
            version_number: artifact.origin.version_number.clone(),
            source: safe_acquisition_source(artifact.origin.source.as_deref()),
        },
    }
}

fn safe_acquisition_source(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    // Existing manifests normally contain `local-file` or a provider name.
    // Do not export arbitrary legacy strings: they may be absolute paths or
    // include credentials embedded in a URL.
    match value.to_ascii_lowercase().as_str() {
        "local-file" | "manual" | "modrinth" | "provider" => Some(value.into()),
        _ => None,
    }
}

// `sha2::Digest` is not an `io::Write`, so keep the read loop explicit.  It
// also bounds memory use while reading arbitrary existing Mod files.
fn digest_writer<'a>(digest: &'a mut Sha256) -> DigestWriter<'a> {
    DigestWriter { digest }
}

struct DigestWriter<'a> {
    digest: &'a mut Sha256,
}

impl Write for DigestWriter<'_> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.digest.update(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn target_from_profile(profile: &ServerProfile) -> ModManagementTarget {
    ModManagementTarget {
        game: default_game(),
        minecraft_version: profile.minecraft_version.clone(),
        loader: profile.server_type.clone(),
        loader_version: profile
            .distribution_build
            .as_deref()
            .map(loader_version)
            .filter(|value| !value.is_empty()),
        java_major: profile.java_major,
    }
}

/// Return the persisted launch target for M5's launch-attempt sidecar.  Keep
/// the construction in one place so M2/M3 state and M5 history cannot drift
/// in loader, Minecraft, or Java fields.
pub fn target_for_profile(profile: &ServerProfile) -> ModManagementTarget {
    target_from_profile(profile)
}

/// Advance `lastSuccessfulLaunch` only after a loader Ready marker has been
/// observed.  The caller is the M5 observer; start/fail/exit transitions never
/// call this function.  State is read and replaced through the existing
/// atomic sidecar writer, preserving all M2/M3 inventory and role fields.
pub fn mark_successful_launch(
    profile: &ServerProfile,
    ready_at: &str,
) -> AppResult<ModManagementState> {
    if ready_at.trim().is_empty() {
        return Err(AppError::Validation("Ready時刻が空です".into()));
    }
    let mut state = get_or_create(profile)?;
    state.last_successful_launch = Some(ready_at.trim().to_string());
    state.updated_at = Utc::now().to_rfc3339();
    write(profile, &state)?;
    Ok(state)
}

fn loader_version(build: &str) -> String {
    match build.rsplit_once('-') {
        Some((_, version)) if !version.is_empty() => version.to_string(),
        _ => build.to_string(),
    }
}

fn validate_state(state: &mut ModManagementState, profile: &ServerProfile) -> AppResult<()> {
    if state.schema_version != MOD_MANAGEMENT_SCHEMA_VERSION {
        return Err(AppError::Validation(format!(
            "Mod管理状態のschemaVersion {}には対応していません",
            state.schema_version
        )));
    }
    if state.server_id.is_empty() {
        // Legacy sidecars did not always carry the server ID.  The caller's
        // profile is the only safe source for filling it during a read.
        state.server_id = profile.id.clone();
    } else if state.server_id != profile.id {
        return Err(AppError::Validation(
            "別のサーバー用のMod管理状態です".into(),
        ));
    }
    if state.target.game.is_empty() {
        state.target.game = default_game();
    }
    if state.updated_at.is_empty() {
        state.updated_at = Utc::now().to_rfc3339();
    }
    Ok(())
}

pub fn write(profile: &ServerProfile, state: &ModManagementState) -> AppResult<()> {
    let path = state_path(profile);
    write_state_atomically(&path, state)
}

fn write_state_atomically(path: &Path, state: &ModManagementState) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::Validation("Mod管理状態の保存先が正しくありません".into()))?;
    reject_symlink(parent)?;
    if let Some(server_hub) = parent.parent() {
        reject_symlink(server_hub)?;
    }
    fs::create_dir_all(parent)?;
    let bytes = serde_json::to_vec_pretty(state)?;
    let temporary = parent.join(format!(".state.json.tmp-{}", Uuid::new_v4()));
    let result = (|| -> AppResult<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        atomic_replace(&temporary, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn reject_symlink(path: &Path) -> AppResult<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(AppError::Validation(format!(
                "シンボリックリンクのMod管理パスは安全のため操作できません: {}",
                path.display()
            )));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    Ok(())
}

fn atomic_replace(source: &Path, destination: &Path) -> io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::{
            Win32::Storage::FileSystem::{
                MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
            },
            core::PCWSTR,
        };
        let source = source
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let destination = destination
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        // MoveFileEx with REPLACE_EXISTING replaces the old state in one
        // filesystem operation; unlike remove+rename it never leaves a gap
        // where readers can observe a missing state.
        unsafe {
            MoveFileExW(
                PCWSTR(source.as_ptr()),
                PCWSTR(destination.as_ptr()),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        }
        .map_err(|error| io::Error::other(error.to_string()))
    }
    #[cfg(not(windows))]
    {
        fs::rename(source, destination)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{BasicSettings, ServerProfile};
    use std::collections::BTreeMap;
    use zip::{ZipWriter, write::SimpleFileOptions};

    fn profile(root: &Path) -> ServerProfile {
        ServerProfile {
            id: "m2-server".into(),
            name: "M2 test".into(),
            root_path: root.display().to_string(),
            game_kind: "minecraft".into(),
            server_type: "forge".into(),
            minecraft_version: "1.20.1".into(),
            distribution_build: Some("1.20.1-47.4.10".into()),
            launch_target: "run.bat".into(),
            java_path: "java.exe".into(),
            java_major: 17,
            min_memory_mib: 1024,
            max_memory_mib: 4096,
            port: 25565,
            eula_accepted_at: "test".into(),
            pending_restart: false,
            settings: BasicSettings::default(),
            palworld_settings: None,
            created_at: "test".into(),
            updated_at: "test".into(),
        }
    }

    fn temp_root(label: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("msh-mod-management-{label}-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn write_jar(path: &Path, entries: &[(&str, &[u8])]) {
        let file = File::create(path).unwrap();
        let mut writer = ZipWriter::new(file);
        for (name, bytes) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap();
    }

    fn jar_bytes(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        for (name, bytes) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn tree_bytes(root: &Path, directory: &str) -> BTreeMap<String, Vec<u8>> {
        let base = root.join(directory);
        if !base.is_dir() {
            return BTreeMap::new();
        }
        walkdir::WalkDir::new(&base)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file())
            .filter_map(|entry| {
                let relative = entry
                    .path()
                    .strip_prefix(&base)
                    .ok()?
                    .to_string_lossy()
                    .replace('\\', "/");
                Some((relative, fs::read(entry.path()).ok()?))
            })
            .collect()
    }

    #[test]
    fn first_creation_only_writes_the_new_sidecar_and_integrates_legacy_inputs() {
        let root = temp_root("initial");
        let server = profile(&root);
        fs::create_dir_all(root.join("mods")).unwrap();
        fs::create_dir_all(root.join("world")).unwrap();
        fs::create_dir_all(root.join("config")).unwrap();
        fs::create_dir_all(root.join(".server-hub/extension-manifests")).unwrap();
        fs::create_dir_all(root.join(".server-hub/disabled/mod")).unwrap();
        fs::write(root.join("mods/active.jar"), b"active-mod").unwrap();
        fs::write(root.join(".server-hub/disabled/mod/old.jar"), b"old-mod").unwrap();
        fs::write(root.join("world/level.dat"), b"world").unwrap();
        fs::write(root.join("config/example.toml"), b"secret=false\n").unwrap();
        let old_hash = hex::encode(Sha256::digest(b"old-mod"));
        fs::write(
            root.join(".server-hub/extension-manifests/old.json"),
            serde_json::to_vec_pretty(&serde_json::json!({
                "fileName": "old.jar",
                "kind": "mod",
                "sha256": old_hash,
                "source": "local-file"
            }))
            .unwrap(),
        )
        .unwrap();

        let before = [
            ("mods", tree_bytes(&root, "mods")),
            ("world", tree_bytes(&root, "world")),
            ("config", tree_bytes(&root, "config")),
        ];
        let state = get_or_create(&server).unwrap();
        let after = [
            ("mods", tree_bytes(&root, "mods")),
            ("world", tree_bytes(&root, "world")),
            ("config", tree_bytes(&root, "config")),
        ];
        assert_eq!(before, after);
        assert_eq!(state.schema_version, MOD_MANAGEMENT_SCHEMA_VERSION);
        assert_eq!(state.target.loader_version.as_deref(), Some("47.4.10"));
        assert_eq!(state.artifacts.len(), 2);
        let old = state
            .artifacts
            .iter()
            .find(|item| item.file_name == "old.jar")
            .unwrap();
        assert!(!old.active);
        assert!(old.present);
        assert_eq!(old.origin.provider, "manual");
        assert!(state_path(&server).is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn atomic_replace_failure_keeps_the_previous_state() {
        let root = temp_root("atomic-failure");
        let state_path = root.join(".server-hub/mod-management/state.json");
        fs::create_dir_all(state_path.parent().unwrap()).unwrap();
        fs::write(&state_path, b"old-state\n").unwrap();
        let state = ModManagementState {
            schema_version: MOD_MANAGEMENT_SCHEMA_VERSION,
            server_id: "m2-server".into(),
            target: ModManagementTarget::default(),
            desired_sets: ModManagementDesiredSets::default(),
            role_overrides: Vec::new(),
            artifacts: Vec::new(),
            last_successful_launch: None,
            updated_at: Utc::now().to_rfc3339(),
        };
        let result = write_state_atomically_with(&state_path, &state, |_source, _destination| {
            Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "injected failure",
            ))
        });
        assert!(result.is_err());
        assert_eq!(fs::read(&state_path).unwrap(), b"old-state\n");
        assert_eq!(
            fs::read_dir(state_path.parent().unwrap())
                .unwrap()
                .filter_map(Result::ok)
                .count(),
            1,
            "the failed replacement must clean its temporary file"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn refresh_replaces_only_the_sidecar_and_updates_the_active_set() {
        let root = temp_root("refresh");
        let server = profile(&root);
        fs::create_dir_all(root.join("mods")).unwrap();
        fs::write(root.join("mods/one.jar"), b"one").unwrap();
        let first = get_or_create(&server).unwrap();
        assert_eq!(first.desired_sets.server.len(), 1);
        fs::write(root.join("mods/two.jar"), b"two").unwrap();
        let second = refresh(&server).unwrap();
        assert_eq!(second.desired_sets.server.len(), 2);
        assert_eq!(second.artifacts.len(), 2);
        assert_eq!(fs::read(root.join("mods/one.jar")).unwrap(), b"one");
        assert_eq!(fs::read(root.join("mods/two.jar")).unwrap(), b"two");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fabric_environment_is_strong_evidence_and_client_manifest_excludes_unknown() {
        let root = temp_root("m3-fabric-roles");
        let server = profile(&root);
        fs::create_dir_all(root.join("mods")).unwrap();
        write_jar(
            &root.join("mods/client-hud.jar"),
            &[(
                "fabric.mod.json",
                br#"{"schemaVersion":1,"id":"hud","version":"1.0.0","environment":"client","depends":{"minecraft":"1.20.1"}}"#,
            )],
        );
        fs::write(root.join("mods/unknown-client.jar"), b"not-a-jar").unwrap();
        let state = refresh(&server).unwrap();
        let hud = state
            .artifacts
            .iter()
            .find(|item| item.file_name == "client-hud.jar")
            .unwrap();
        assert_eq!(hud.role, ROLE_CLIENT_ONLY);
        assert!(
            hud.role_evidence
                .iter()
                .any(|item| item == "strong:fabric-environment-client")
        );
        let unknown = state
            .artifacts
            .iter()
            .find(|item| item.file_name == "unknown-client.jar")
            .unwrap();
        assert_eq!(unknown.role, ROLE_UNKNOWN);
        assert!(
            unknown
                .role_evidence
                .iter()
                .any(|item| item.starts_with("weak:filename-client"))
        );
        assert!(state.desired_sets.client.contains(&hud.artifact_id));
        assert!(!state.desired_sets.client.contains(&unknown.artifact_id));

        let destination = root.join("client-manifest.json");
        let count = export_client_manifest(&server, &destination).unwrap();
        assert_eq!(count, 1);
        let manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(&destination).unwrap()).unwrap();
        assert_eq!(manifest["artifacts"].as_array().unwrap().len(), 1);
        assert_eq!(manifest["unresolved"].as_array().unwrap().len(), 1);
        let text = serde_json::to_string(&manifest).unwrap();
        assert!(!text.contains(&root.display().to_string()));
        assert!(!text.contains("not-a-jar"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn forge_side_and_nested_library_are_kept_as_evidence_without_flattening() {
        let root = temp_root("m3-forge-embedded");
        let server = profile(&root);
        fs::create_dir_all(root.join("mods")).unwrap();
        let nested = jar_bytes(&[(
            "fabric.mod.json",
            br#"{"id":"mixinextras","version":"0.3.5","environment":"*"}"#,
        )]);
        let forge = br#"[[mods]]
modId="renderhelper"
version="1.0.0"
side="CLIENT"
"#;
        for name in ["one.jar", "two.jar"] {
            write_jar(
                &root.join("mods").join(name),
                &[
                    ("META-INF/mods.toml", forge),
                    ("META-INF/jarjar/mixinextras.jar", &nested),
                ],
            );
        }
        let state = refresh(&server).unwrap();
        assert_eq!(state.artifacts.len(), 2);
        for artifact in &state.artifacts {
            assert_eq!(artifact.role, ROLE_CLIENT_ONLY);
            assert!(
                artifact
                    .role_evidence
                    .iter()
                    .any(|item| item == "strong:forge-metadata-side-client")
            );
            assert_eq!(artifact.embedded.len(), 1);
            assert_eq!(artifact.embedded[0]["ids"][0], "mixinextras");
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn conflicting_strong_metadata_stays_unknown_after_a_third_signal() {
        let root = temp_root("m3-sticky-role-conflict");
        let server = profile(&root);
        fs::create_dir_all(root.join("mods")).unwrap();
        write_jar(
            &root.join("mods/conflicting.jar"),
            &[(
                "META-INF/mods.toml",
                br#"[[mods]]
modId="first"
version="1.0.0"
side="CLIENT"

[[mods]]
modId="second"
version="1.0.0"
side="SERVER"

[[mods]]
modId="third"
version="1.0.0"
side="BOTH"
"#,
            )],
        );
        let state = refresh(&server).unwrap();
        let artifact = &state.artifacts[0];
        assert_eq!(artifact.role, ROLE_UNKNOWN);
        assert_eq!(
            artifact
                .role_evidence
                .iter()
                .filter(|item| item.as_str() == "strong:metadata-role-conflict")
                .count(),
            1
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn client_optional_environment_is_in_both_sets_with_safe_environment_aliases() {
        let root = temp_root("m3-client-optional");
        let server = profile(&root);
        fs::create_dir_all(root.join("mods")).unwrap();
        write_jar(
            &root.join("mods/optional.jar"),
            &[(
                "fabric.mod.json",
                br#"{"id":"optional","version":"1.0.0","environment":"server_only_client_optional"}"#,
            )],
        );
        write_jar(
            &root.join("mods/prefers-both.jar"),
            &[(
                "fabric.mod.json",
                br#"{"id":"prefers-both","version":"1.0.0","environment":"client_or_server_prefers_both"}"#,
            )],
        );
        write_jar(
            &root.join("mods/unrecognized.jar"),
            &[(
                "fabric.mod.json",
                br#"{"id":"unrecognized","version":"1.0.0","environment":"maybe_client"}"#,
            )],
        );
        let state = refresh(&server).unwrap();
        let optional = state
            .artifacts
            .iter()
            .find(|item| item.file_name == "optional.jar")
            .unwrap();
        assert_eq!(optional.role, ROLE_CLIENT_OPTIONAL);
        assert!(state.desired_sets.server.contains(&optional.artifact_id));
        assert!(state.desired_sets.client.contains(&optional.artifact_id));
        assert!(
            state
                .desired_sets
                .optional_client
                .contains(&optional.artifact_id)
        );
        assert!(
            optional
                .role_evidence
                .iter()
                .any(|item| item == "strong:fabric-environment-server_only_client_optional")
        );

        let both = state
            .artifacts
            .iter()
            .find(|item| item.file_name == "prefers-both.jar")
            .unwrap();
        assert_eq!(both.role, ROLE_BOTH);
        assert!(state.desired_sets.server.contains(&both.artifact_id));
        assert!(state.desired_sets.client.contains(&both.artifact_id));
        assert!(
            !state
                .desired_sets
                .optional_client
                .contains(&both.artifact_id)
        );
        assert!(
            both.role_evidence
                .iter()
                .any(|item| item == "strong:fabric-environment-client_or_server_prefers_both")
        );

        let unrecognized = state
            .artifacts
            .iter()
            .find(|item| item.file_name == "unrecognized.jar")
            .unwrap();
        assert_eq!(unrecognized.role, ROLE_UNKNOWN);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn client_manifest_destination_is_validated_and_atomically_replaced() {
        let root = temp_root("m3-manifest-destination");
        let server = profile(&root);
        fs::create_dir_all(root.join("mods")).unwrap();
        write_jar(
            &root.join("mods/client.jar"),
            &[(
                "fabric.mod.json",
                br#"{"id":"client","version":"1.0.0","environment":"client"}"#,
            )],
        );
        refresh(&server).unwrap();

        let destination = root.join("client.json");
        fs::write(&destination, b"old-manifest").unwrap();
        assert_eq!(export_client_manifest(&server, &destination).unwrap(), 1);
        let exported = fs::read_to_string(&destination).unwrap();
        assert!(exported.contains("schemaVersion"));
        assert!(!exported.contains("old-manifest"));
        assert!(
            !fs::read_dir(&root)
                .unwrap()
                .filter_map(Result::ok)
                .any(|entry| entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".client-manifest.tmp-"))
        );

        assert!(export_client_manifest(&server, Path::new("client.json")).is_err());
        assert!(export_client_manifest(&server, &root.join("missing/client.json")).is_err());
        assert!(export_client_manifest(&server, &root.join("client.txt")).is_err());

        let link = root.join("client-link.json");
        #[cfg(windows)]
        let link_result = std::os::windows::fs::symlink_file(&destination, &link);
        #[cfg(unix)]
        let link_result = std::os::unix::fs::symlink(&destination, &link);
        if link_result.is_ok() {
            assert!(export_client_manifest(&server, &link).is_err());
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn role_override_is_hash_bound_and_survives_refresh() {
        let root = temp_root("m3-override");
        let server = profile(&root);
        fs::create_dir_all(root.join("mods")).unwrap();
        fs::write(root.join("mods/manual.jar"), b"manual").unwrap();
        let first = refresh(&server).unwrap();
        let id = first.artifacts[0].artifact_id.clone();
        let updated = set_role_override(
            &server,
            id.clone(),
            ROLE_BOTH.into(),
            Some("確認済み".into()),
        )
        .unwrap();
        assert_eq!(updated.artifacts[0].role, ROLE_BOTH);
        assert!(
            updated.artifacts[0]
                .role_evidence
                .iter()
                .any(|item| item == "strong:user-override")
        );
        let reread = get_or_create(&server).unwrap();
        assert_eq!(reread.artifacts[0].role, ROLE_BOTH);
        assert_eq!(reread.role_overrides.len(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn existing_modrinth_manifest_environment_has_priority_over_jar_heuristics() {
        let root = temp_root("m3-modrinth-manifest");
        let server = profile(&root);
        fs::create_dir_all(root.join("mods")).unwrap();
        fs::create_dir_all(root.join(".server-hub/extension-manifests")).unwrap();
        let jar = root.join("mods/managed.jar");
        write_jar(
            &jar,
            &[(
                "fabric.mod.json",
                br#"{"id":"managed","version":"1.0.0","environment":"*"}"#,
            )],
        );
        let hash = hex::encode(Sha256::digest(fs::read(&jar).unwrap()));
        fs::write(
            root.join(".server-hub/extension-manifests/managed.json"),
            serde_json::to_vec_pretty(&serde_json::json!({
                "fileName": "managed.jar",
                "kind": "mod",
                "provider": "modrinth",
                "projectId": "managed-project",
                "versionId": "managed-version",
                "versionNumber": "1.0.0",
                "sha256": hash,
                "environment": "client_only",
                "source": root.join("private-token-path").display().to_string()
            }))
            .unwrap(),
        )
        .unwrap();
        let state = refresh(&server).unwrap();
        let artifact = &state.artifacts[0];
        assert_eq!(artifact.role, ROLE_CLIENT_ONLY);
        assert!(
            artifact
                .role_evidence
                .iter()
                .any(|item| item == "strong:manifest-role-client_only")
        );
        assert_eq!(
            artifact.origin.project_id.as_deref(),
            Some("managed-project")
        );
        let destination = root.join("managed-client.json");
        export_client_manifest(&server, &destination).unwrap();
        let exported = String::from_utf8(fs::read(&destination).unwrap()).unwrap();
        assert!(!exported.contains(&root.display().to_string()));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn legacy_state_without_schema_version_is_read_as_v1() {
        let root = temp_root("legacy-state");
        let server = profile(&root);
        let path = state_path(&server);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            &path,
            serde_json::to_vec_pretty(&serde_json::json!({
                "serverId": server.id,
                "target": {
                    "minecraftVersion": "1.20.1",
                    "loader": "forge",
                    "loaderVersion": "47.4.10",
                    "javaMajor": 17
                },
                "desiredSets": {"server": [], "client": [], "optionalClient": []},
                "roleOverrides": [],
                "lastSuccessfulLaunch": null,
                "updatedAt": "legacy"
            }))
            .unwrap(),
        )
        .unwrap();
        let state = read(&server).unwrap().unwrap();
        assert_eq!(state.schema_version, MOD_MANAGEMENT_SCHEMA_VERSION);
        assert_eq!(state.server_id, server.id);
        assert_eq!(state.updated_at, "legacy");
        fs::remove_dir_all(root).unwrap();
    }

    fn write_state_atomically_with<F>(
        path: &Path,
        state: &ModManagementState,
        replace: F,
    ) -> AppResult<()>
    where
        F: FnOnce(&Path, &Path) -> io::Result<()>,
    {
        let parent = path.parent().unwrap();
        fs::create_dir_all(parent)?;
        let bytes = serde_json::to_vec_pretty(state)?;
        let temporary = parent.join(format!(".state.json.tmp-{}", Uuid::new_v4()));
        let result = (|| -> AppResult<()> {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            replace(&temporary, path)?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }
}
