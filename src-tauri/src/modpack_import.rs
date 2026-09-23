//! Phase M4: read-only Modpack inspection and safe new-configuration creation.
//!
//! This module deliberately does not install into an existing server.  It
//! understands the local parts of CurseForge exports/profiles, Modrinth
//! `.mrpack` files, and an existing `mods` directory.  Archive entries are
//! inspected in memory; no archive is extracted while planning.  The only
//! write path is the explicit new-configuration operation, which copies
//! already-local, redistributable server artifacts into an isolated staging
//! directory and atomically renames it into an empty destination.

use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{self, Cursor, Read, Seek, Write},
    path::{Component, Path, PathBuf},
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use zip::ZipArchive;

use crate::{
    error::{AppError, AppResult},
    mod_management::{
        MOD_MANAGEMENT_SCHEMA_VERSION, ModManagementArtifact, ModManagementDesiredSets,
        ModManagementOrigin, ModManagementState, ModManagementTarget,
    },
};

const MAX_ARCHIVE_ENTRIES: usize = 20_000;
const MAX_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_BYTES: u64 = 256 * 1024 * 1024;
const MAX_ARCHIVE_TOTAL_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_COMPRESSION_RATIO: u64 = 1_000;
const MAX_NESTED_ARCHIVE_DEPTH: u8 = 2;
const MAX_METADATA_BYTES: u64 = 2 * 1024 * 1024;
const MAX_LOCAL_JAR_BYTES: u64 = 256 * 1024 * 1024;
const MAX_SOURCE_FILES: usize = 20_000;
const MAX_SOURCE_FILE_BYTES: u64 = 256 * 1024 * 1024;

pub const MODPACK_CONFIRM_PREFIX: &str = "CREATE MODPACK";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModpackAnalyzeTarget {
    pub game: String,
    pub minecraft_version: String,
    pub loader: String,
    #[serde(default)]
    pub loader_version: Option<String>,
    #[serde(default)]
    pub java_major: u16,
}

impl From<ModManagementTarget> for ModpackAnalyzeTarget {
    fn from(value: ModManagementTarget) -> Self {
        Self {
            game: value.game,
            minecraft_version: value.minecraft_version,
            loader: value.loader,
            loader_version: value.loader_version,
            java_major: value.java_major,
        }
    }
}

impl From<ModpackAnalyzeTarget> for ModManagementTarget {
    fn from(value: ModpackAnalyzeTarget) -> Self {
        Self {
            game: value.game,
            minecraft_version: value.minecraft_version,
            loader: value.loader,
            loader_version: value.loader_version,
            java_major: value.java_major,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModpackPlan {
    pub schema_version: u32,
    pub source_kind: String,
    /// A display name only.  The source's absolute host path is intentionally
    /// never placed in a public model or serialized plan.
    pub source_name: String,
    pub target: ModpackAnalyzeTarget,
    pub artifacts: Vec<ModpackArtifactPlan>,
    pub unresolved_dependencies: Vec<ModpackUnresolvedDependency>,
    pub overrides: Vec<String>,
    pub config_files: Vec<String>,
    pub redistribution: Vec<ModpackRedistribution>,
    pub existing_server_apply: ModpackExistingServerApply,
    pub safety: ModpackSafetySummary,
    pub plan_fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModpackArtifactPlan {
    pub artifact_id: String,
    pub file_name: String,
    /// Relative path inside the selected source.  It is never absolute.
    pub source_relative_path: String,
    pub size_bytes: u64,
    pub sha256: Option<String>,
    pub role: String,
    pub role_evidence: Vec<String>,
    pub provider: String,
    pub project_id: Option<String>,
    pub file_id: Option<String>,
    pub version_id: Option<String>,
    pub version_number: Option<String>,
    pub acquisition: ModpackAcquisition,
    pub redistributable: bool,
    pub stage_eligible: bool,
    pub unresolved: bool,
    pub dependencies: Vec<ModpackDependency>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModpackAcquisition {
    pub method: String,
    pub source: String,
    pub requires_network: bool,
    pub instructions: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModpackDependency {
    pub id: String,
    pub required: bool,
    pub side: String,
    pub version_range: Option<String>,
    pub resolved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModpackUnresolvedDependency {
    pub id: String,
    pub required: bool,
    pub side: String,
    pub reason: String,
    pub provider: Option<String>,
    pub project_id: Option<String>,
    pub file_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModpackRedistribution {
    pub subject: String,
    pub provider: String,
    pub allowed: bool,
    pub reason: String,
    pub acquisition: ModpackAcquisition,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModpackExistingServerApply {
    pub enabled: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModpackSafetySummary {
    pub read_only_analysis: bool,
    pub archive_limits_checked: bool,
    pub unknown_placement_blocked: bool,
    pub source_unchanged: bool,
    pub network_used: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModpackCreateResult {
    pub plan_fingerprint: String,
    pub staged_artifacts: usize,
    pub excluded_artifacts: usize,
    pub state_created: bool,
    pub destination_name: String,
}

#[derive(Debug, Clone)]
struct SourceArtifact {
    relative: String,
    source_path: Option<PathBuf>,
    /// A private reference into the selected archive.  Archive payloads are
    /// intentionally not retained in the inventory; one bounded entry is
    /// read only when analysis or staging needs it.
    archive_ref: Option<ArchiveArtifactRef>,
    file_name: String,
    size_bytes: u64,
    provider: String,
    project_id: Option<String>,
    file_id: Option<String>,
    version_id: Option<String>,
    version_number: Option<String>,
    expected_sha256: Option<String>,
    role_hint: Option<String>,
    acquisition: ModpackAcquisition,
    redistributable: bool,
    dependencies: Vec<ModpackDependency>,
}

#[derive(Debug, Clone)]
struct ArchiveArtifactRef {
    archive_path: PathBuf,
    entry_name: String,
}

#[derive(Debug)]
struct PreparedSourceArtifact {
    source_artifact: SourceArtifact,
    inspection: JarInspection,
    sha256: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct SourceInventory {
    kind: String,
    name: String,
    target: Option<ModpackAnalyzeTarget>,
    artifacts: Vec<SourceArtifact>,
    unresolved: Vec<ModpackUnresolvedDependency>,
    overrides: Vec<String>,
    configs: Vec<String>,
}

#[derive(Debug, Clone, Default)]
struct JarInspection {
    ids: Vec<String>,
    version: Option<String>,
    role: Option<String>,
    evidence: Vec<String>,
    dependencies: Vec<ModpackDependency>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeManifest {
    #[serde(default)]
    minecraft: Option<CurseForgeMinecraft>,
    #[serde(default)]
    files: Vec<CurseForgeFile>,
    #[serde(default)]
    name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeMinecraft {
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    mod_loaders: Vec<CurseForgeLoader>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeLoader {
    id: String,
    #[serde(default)]
    primary: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeFile {
    project_id: u64,
    file_id: u64,
    #[serde(default)]
    required: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct ModrinthIndex {
    #[serde(default)]
    dependencies: BTreeMap<String, String>,
    #[serde(default)]
    files: Vec<ModrinthFile>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default, rename = "formatVersion")]
    format_version: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
struct ModrinthFile {
    path: String,
    #[serde(default)]
    hashes: HashMap<String, String>,
    #[serde(default)]
    downloads: Vec<String>,
    #[serde(default)]
    env: Option<ModrinthEnvironment>,
}

#[derive(Debug, Clone, Deserialize)]
struct ModrinthEnvironment {
    #[serde(default)]
    client: Option<String>,
    #[serde(default)]
    server: Option<String>,
}

/// Analyze a local source.  This function performs no writes and never uses a
/// network API.  `target` overrides a pack target only when the caller has a
/// known server tuple (for example, a new server wizard).
pub fn analyze(source: &Path, target: Option<ModpackAnalyzeTarget>) -> AppResult<ModpackPlan> {
    let mut inventory = inspect_source(source)?;
    if let Some(target) = target {
        inventory.target = Some(target);
    }
    let target = inventory.target.clone().unwrap_or_else(default_target);
    if target.game != "minecraft-java" && !target.game.is_empty() {
        return Err(AppError::Validation(
            "M4のModパック解析はMinecraft Java Editionだけに対応しています".into(),
        ));
    }

    // Keep only metadata and hashes between the two dependency-resolution
    // passes. Archive payloads are bounded to one artifact and dropped as
    // soon as its inspection/hash is complete.
    let mut prepared = Vec::with_capacity(inventory.artifacts.len());
    for source_artifact in inventory.artifacts {
        let mut inspection = JarInspection::default();
        let mut sha256 = source_artifact.expected_sha256.clone();
        if source_artifact
            .file_name
            .to_ascii_lowercase()
            .ends_with(".jar")
        {
            if let Some(archive_ref) = source_artifact.archive_ref.as_ref() {
                let bytes = read_archive_entry_from_path(
                    &archive_ref.archive_path,
                    &archive_ref.entry_name,
                    MAX_LOCAL_JAR_BYTES,
                )?;
                sha256 = Some(hex::encode(Sha256::digest(&bytes)));
                inspection = inspect_jar_bytes_owned(bytes)?;
            } else if let Some(path) = source_artifact.source_path.as_deref() {
                let bytes = read_bounded_path(path, MAX_LOCAL_JAR_BYTES)?;
                sha256 = Some(hex::encode(Sha256::digest(&bytes)));
                inspection = inspect_jar_bytes_owned(bytes)?;
            }
        }
        prepared.push(PreparedSourceArtifact {
            source_artifact,
            inspection,
            sha256,
        });
    }

    let mut known_ids = HashSet::new();
    for artifact in &prepared {
        known_ids.extend(
            artifact
                .inspection
                .ids
                .iter()
                .map(|id| id.to_ascii_lowercase()),
        );
    }

    let mut artifacts = Vec::new();
    let mut unresolved = inventory.unresolved;
    let mut redistribution = Vec::new();
    for prepared_artifact in prepared {
        let PreparedSourceArtifact {
            source_artifact,
            inspection,
            sha256,
        } = prepared_artifact;
        let role = source_artifact
            .role_hint
            .clone()
            .or(inspection.role.clone())
            .unwrap_or_else(|| "unknown".into());
        let mut role_evidence = inspection.evidence.clone();
        if source_artifact.role_hint.is_some() {
            role_evidence.push("strong:pack-environment".into());
        }
        if role == "unknown" {
            role_evidence.push("weak:role-unresolved".into());
        }
        let provider = source_artifact.provider.clone();
        let mut redistributable = source_artifact.redistributable;
        if let (Some(expected), Some(actual)) = (
            source_artifact.expected_sha256.as_deref(),
            sha256.as_deref(),
        ) {
            if !expected.eq_ignore_ascii_case(actual) {
                redistributable = false;
                unresolved.push(ModpackUnresolvedDependency {
                    id: source_artifact.file_name.clone(),
                    required: true,
                    side: "unknown".into(),
                    reason: "ローカルファイルのハッシュがpack記録と一致しません".into(),
                    provider: Some(source_artifact.provider.clone()),
                    project_id: source_artifact.project_id.clone(),
                    file_id: source_artifact.file_id.clone(),
                });
            }
        }
        // Pack metadata and the JAR's own metadata are both authoritative
        // inputs. Merge and deduplicate them before resolution so a required
        // dependency found only in fabric.mod.json/mods.toml is never staged.
        let mut dependencies =
            merge_dependencies(&source_artifact.dependencies, &inspection.dependencies);
        for dependency in &mut dependencies {
            dependency.resolved = known_ids.contains(&dependency.id.to_ascii_lowercase());
        }
        let unresolved_artifact = dependencies
            .iter()
            .any(|dependency| dependency.required && !dependency.resolved);
        let stage_eligible = redistributable
            && sha256.is_some()
            && matches!(role.as_str(), "server-only" | "both")
            && !unresolved_artifact;
        for dependency in &dependencies {
            if dependency.required && !dependency.resolved {
                unresolved.push(ModpackUnresolvedDependency {
                    id: dependency.id.clone(),
                    required: true,
                    side: dependency.side.clone(),
                    reason: "ローカルに依存JARがなく、ネットワーク取得も行っていません".into(),
                    provider: Some(provider.clone()),
                    project_id: source_artifact.project_id.clone(),
                    file_id: source_artifact.file_id.clone(),
                });
            }
        }
        let acquisition = source_artifact.acquisition.clone();
        redistribution.push(ModpackRedistribution {
            subject: source_artifact.file_name.clone(),
            provider: provider.clone(),
            allowed: redistributable,
            reason: if redistributable {
                "選択したローカルJAR。TomoNodeは配布元ファイルを再取得・再配布しません".into()
            } else {
                "配布元の再配布条件を確認できないため同梱しません".into()
            },
            acquisition: acquisition.clone(),
        });
        let file_name = source_artifact.file_name.clone();
        let artifact_id = sha256
            .as_ref()
            .map(|hash| format!("sha256:{hash}"))
            .unwrap_or_else(|| format!("source:{file_name}"));
        artifacts.push(ModpackArtifactPlan {
            artifact_id,
            file_name,
            source_relative_path: source_artifact.relative,
            size_bytes: source_artifact.size_bytes,
            sha256,
            role,
            role_evidence,
            provider,
            project_id: source_artifact.project_id,
            file_id: source_artifact.file_id,
            version_id: source_artifact.version_id,
            version_number: source_artifact.version_number.or(inspection.version),
            acquisition,
            redistributable,
            stage_eligible,
            unresolved: unresolved_artifact,
            dependencies,
        });
    }
    artifacts.sort_by(|left, right| left.source_relative_path.cmp(&right.source_relative_path));
    unresolved.sort_by(|left, right| left.id.cmp(&right.id).then(left.reason.cmp(&right.reason)));
    unresolved.dedup_by(|left, right| left.id == right.id && left.reason == right.reason);
    redistribution.sort_by(|left, right| left.subject.cmp(&right.subject));

    let mut plan = ModpackPlan {
        schema_version: 1,
        source_kind: inventory.kind,
        source_name: inventory.name,
        target,
        artifacts,
        unresolved_dependencies: unresolved,
        overrides: inventory.overrides,
        config_files: inventory.configs,
        redistribution,
        existing_server_apply: ModpackExistingServerApply {
            enabled: false,
            reason:
                "M4では既存サーバーへの適用を実装していません。新規の空フォルダーだけを作成できます"
                    .into(),
        },
        safety: ModpackSafetySummary {
            read_only_analysis: true,
            archive_limits_checked: true,
            unknown_placement_blocked: true,
            source_unchanged: true,
            network_used: false,
        },
        plan_fingerprint: String::new(),
    };
    plan.plan_fingerprint = fingerprint(&plan)?;
    Ok(plan)
}

/// Create a new configuration only after the plan is re-read and its
/// fingerprint plus explicit confirmation match.  Existing server folders
/// and non-empty destinations are rejected.
pub fn create_new_configuration(
    source: &Path,
    destination: &Path,
    expected_fingerprint: &str,
    confirmation: &str,
    target: Option<ModpackAnalyzeTarget>,
) -> AppResult<ModpackCreateResult> {
    let plan = analyze(source, target)?;
    if plan.plan_fingerprint != expected_fingerprint {
        return Err(AppError::Validation(
            "解析結果が変わったため、Modパック計画を再確認してください".into(),
        ));
    }
    let expected_confirmation = format!("{MODPACK_CONFIRM_PREFIX} {}", plan.plan_fingerprint);
    if confirmation.trim() != expected_confirmation {
        return Err(AppError::Validation(format!(
            "作成確認には半角で「{expected_confirmation}」を入力してください"
        )));
    }
    validate_destination(destination)?;
    reject_destination_overlap(source, destination)?;
    let source_root = source.to_path_buf();
    let eligible_count = plan
        .artifacts
        .iter()
        .filter(|artifact| artifact.stage_eligible)
        .count();
    if eligible_count == 0 {
        return Err(AppError::Validation(
            "サーバー用／両方の確認済みローカルJARがないため、新規構成を作成できません".into(),
        ));
    }
    let archive_refs = inspect_source(source)?
        .artifacts
        .into_iter()
        .filter_map(|artifact| {
            artifact
                .archive_ref
                .map(|archive_ref| (artifact.relative, archive_ref))
        })
        .collect::<HashMap<_, _>>();
    let staging = staging_path(destination)?;
    let mut staged = 0usize;
    let mut excluded = 0usize;
    let result = (|| -> AppResult<()> {
        fs::create_dir_all(staging.join("mods"))?;
        for artifact in &plan.artifacts {
            if !artifact.stage_eligible {
                excluded += 1;
                continue;
            }
            let relative = safe_relative(&artifact.source_relative_path)?;
            let output_name = safe_file_name(&artifact.file_name)?;
            let target_path = staging.join("mods").join(output_name);
            if target_path.exists() {
                return Err(AppError::Validation(
                    "計画内に同名JARがあるため作成を停止しました".into(),
                ));
            }
            let bytes = read_local_artifact(
                &source_root,
                relative.as_path(),
                artifact,
                archive_refs.get(&artifact.source_relative_path),
            )?;
            if bytes.len() as u64 != artifact.size_bytes {
                return Err(AppError::Validation(format!(
                    "{}のサイズが計画と一致しません",
                    artifact.file_name
                )));
            }
            let actual = hex::encode(Sha256::digest(&bytes));
            if artifact.sha256.as_deref() != Some(actual.as_str()) {
                return Err(AppError::Validation(format!(
                    "{}のSHA-256再検証に失敗しました",
                    artifact.file_name
                )));
            }
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target_path)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            staged += 1;
        }
        write_import_state(&staging, &plan)?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }

    let destination_name = destination
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "新規構成".into());
    let empty_backup = destination.with_extension(format!("tomonode-empty-{}", Uuid::new_v4()));
    let had_empty_destination = destination.exists();
    if had_empty_destination {
        if let Err(error) = fs::rename(destination, &empty_backup) {
            let _ = fs::remove_dir_all(&staging);
            return Err(error.into());
        }
    }
    if let Err(error) = fs::rename(&staging, destination) {
        if had_empty_destination {
            let _ = fs::rename(&empty_backup, destination);
        }
        let _ = fs::remove_dir_all(&staging);
        return Err(error.into());
    }
    if had_empty_destination {
        let _ = fs::remove_dir_all(&empty_backup);
    }
    Ok(ModpackCreateResult {
        plan_fingerprint: plan.plan_fingerprint,
        staged_artifacts: staged,
        excluded_artifacts: excluded,
        state_created: destination
            .join(".server-hub/mod-management/state.json")
            .is_file(),
        destination_name,
    })
}

fn inspect_source(source: &Path) -> AppResult<SourceInventory> {
    reject_symlink(source)?;
    let metadata = fs::metadata(source)?;
    if metadata.is_dir() {
        return inspect_directory(source);
    }
    if !metadata.is_file() {
        return Err(AppError::Validation(
            "Modパックの入力はファイルまたはフォルダーにしてください".into(),
        ));
    }
    if metadata.len() > MAX_ARCHIVE_BYTES {
        return Err(AppError::Validation(
            "Modパックの圧縮ファイルが安全上限512 MiBを超えています".into(),
        ));
    }
    let file = File::open(source)?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| AppError::Validation(format!("ZIP／MRPACKを読み取れません: {error}")))?;
    validate_archive(&mut archive, 0)?;
    let mut names = HashSet::new();
    for index in 0..archive.len() {
        let file = archive.by_index(index).map_err(zip_error)?;
        names.insert(normalize_relative_name(file.name())?);
    }
    if names.contains("modrinth.index.json") {
        inspect_modrinth_archive(source, &mut archive)
    } else if names.contains("manifest.json") {
        inspect_curseforge_archive(source, &mut archive)
    } else {
        Err(AppError::Validation(
            "manifest.json または modrinth.index.json が見つからないModパックです".into(),
        ))
    }
}

fn inspect_directory(source: &Path) -> AppResult<SourceInventory> {
    let source_name = source
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "mods".into());
    let is_mods_folder = source
        .file_name()
        .is_some_and(|value| value.to_string_lossy().eq_ignore_ascii_case("mods"));
    let profile_manifest = source.join("manifest.json");
    let instance_manifest = source.join("minecraftinstance.json");
    let mut inventory = SourceInventory {
        kind: if is_mods_folder {
            "mods-folder"
        } else {
            "curseforge-profile"
        }
        .into(),
        name: source_name,
        ..Default::default()
    };
    if profile_manifest.is_file() || instance_manifest.is_file() {
        let manifest_path = if profile_manifest.is_file() {
            profile_manifest
        } else {
            instance_manifest
        };
        let bytes = read_bounded_path(&manifest_path, MAX_METADATA_BYTES)?;
        if let Ok(manifest) = serde_json::from_slice::<CurseForgeManifest>(&bytes) {
            apply_curseforge_target(&manifest, &mut inventory);
        }
    }
    let mods_root = if source
        .file_name()
        .is_some_and(|value| value.to_string_lossy().eq_ignore_ascii_case("mods"))
    {
        source.to_path_buf()
    } else {
        source.join("mods")
    };
    if !mods_root.is_dir() {
        return Err(AppError::Validation(
            "選択したフォルダーにmodsがありません".into(),
        ));
    }
    let mut count = 0usize;
    for entry in walk_files(&mods_root)? {
        count += 1;
        if count > MAX_SOURCE_FILES {
            return Err(AppError::Validation(
                "Modフォルダー内の項目数が安全上限を超えています".into(),
            ));
        }
        if !entry.file_name().is_some_and(|value| {
            value
                .to_string_lossy()
                .to_ascii_lowercase()
                .ends_with(".jar")
        }) {
            continue;
        }
        let metadata = fs::metadata(&entry)?;
        if metadata.len() > MAX_LOCAL_JAR_BYTES {
            return Err(AppError::Validation(format!(
                "{}が安全上限を超えています",
                entry.file_name().unwrap_or_default().to_string_lossy()
            )));
        }
        let relative = entry
            .strip_prefix(source)
            .map_err(|_| AppError::Validation("Modの相対パスを解決できません".into()))?
            .to_string_lossy()
            .replace('\\', "/");
        inventory.artifacts.push(SourceArtifact {
            relative: relative.clone(),
            source_path: Some(entry.clone()),
            archive_ref: None,
            file_name: entry
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            size_bytes: metadata.len(),
            provider: "local".into(),
            project_id: None,
            file_id: None,
            version_id: None,
            version_number: None,
            expected_sha256: None,
            role_hint: None,
            acquisition: local_acquisition(relative),
            redistributable: true,
            dependencies: Vec::new(),
        });
    }
    inventory.overrides = list_safe_override_paths(source)?;
    inventory.configs = list_safe_config_paths(source)?;
    Ok(inventory)
}

fn inspect_curseforge_archive(
    source: &Path,
    archive: &mut ZipArchive<File>,
) -> AppResult<SourceInventory> {
    let manifest_bytes = read_zip_entry(archive, "manifest.json", MAX_METADATA_BYTES)?;
    let manifest: CurseForgeManifest =
        serde_json::from_slice(&manifest_bytes).map_err(|error| {
            AppError::Validation(format!("CurseForge manifest.jsonを読み取れません: {error}"))
        })?;
    let mut inventory = SourceInventory {
        kind: "curseforge-export".into(),
        name: safe_display_name(
            manifest.name.as_deref(),
            source
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .as_deref()
                .unwrap_or("curseforge-export.zip"),
        ),
        ..Default::default()
    };
    apply_curseforge_target(&manifest, &mut inventory);
    let only_manifest_file = (manifest.files.len() == 1).then(|| &manifest.files[0]);
    for index in 0..archive.len() {
        let name = normalize_relative_name(archive.by_index(index).map_err(zip_error)?.name())?;
        if is_jar_path(&name)
            && (name.starts_with("overrides/")
                || name.starts_with("mods/")
                || name.contains("/mods/"))
        {
            let size_bytes = archive.by_name(&name).map_err(zip_error)?.size();
            if size_bytes > MAX_LOCAL_JAR_BYTES {
                return Err(AppError::Validation(
                    "ZIP内のJARが安全上限を超えています".into(),
                ));
            }
            let file_name = Path::new(&name)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            inventory.artifacts.push(SourceArtifact {
                relative: name.clone(),
                source_path: None,
                archive_ref: Some(ArchiveArtifactRef {
                    archive_path: source.to_path_buf(),
                    entry_name: name.clone(),
                }),
                file_name,
                size_bytes,
                provider: only_manifest_file
                    .map(|_| "curseforge".into())
                    .unwrap_or_else(|| "local".into()),
                project_id: only_manifest_file.map(|item| item.project_id.to_string()),
                file_id: only_manifest_file.map(|item| item.file_id.to_string()),
                version_id: None,
                version_number: None,
                expected_sha256: None,
                role_hint: None,
                acquisition: local_acquisition(name),
                redistributable: true,
                dependencies: Vec::new(),
            });
        }
    }
    for item in &manifest.files {
        if !inventory
            .artifacts
            .iter()
            .any(|artifact| artifact.file_id.as_deref() == Some(item.file_id.to_string().as_str()))
        {
            inventory.unresolved.push(ModpackUnresolvedDependency {
                id: format!("curseforge:{}:{}", item.project_id, item.file_id),
                required: item.required,
                side: "unknown".into(),
                reason: "CurseForge exportにはJARが同梱されていません。配布元からの取得が必要です"
                    .into(),
                provider: Some("curseforge".into()),
                project_id: Some(item.project_id.to_string()),
                file_id: Some(item.file_id.to_string()),
            });
        }
    }
    inventory.overrides = list_archive_paths(archive, "overrides/")?;
    inventory.configs = inventory
        .overrides
        .iter()
        .filter(|path| is_config_path(path))
        .cloned()
        .collect();
    Ok(inventory)
}

fn inspect_modrinth_archive(
    source: &Path,
    archive: &mut ZipArchive<File>,
) -> AppResult<SourceInventory> {
    let index_bytes = read_zip_entry(archive, "modrinth.index.json", MAX_METADATA_BYTES)?;
    let index: ModrinthIndex = serde_json::from_slice(&index_bytes).map_err(|error| {
        AppError::Validation(format!("Modrinth indexを読み取れません: {error}"))
    })?;
    if index.format_version.is_some_and(|version| version != 1) {
        return Err(AppError::Validation(
            "未対応のModrinth pack formatです".into(),
        ));
    }
    let mut inventory = SourceInventory {
        kind: "modrinth-mrpack".into(),
        name: safe_display_name(
            index.name.as_deref(),
            source
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .as_deref()
                .unwrap_or("pack.mrpack"),
        ),
        ..Default::default()
    };
    inventory.target = modrinth_target(&index.dependencies);
    for file in index.files {
        let relative = safe_relative(&file.path)?
            .to_string_lossy()
            .replace('\\', "/");
        let matching_entry = archive
            .by_name(&format!("overrides/{relative}"))
            .ok()
            .map(|entry| (format!("overrides/{relative}"), entry.size()));
        let (archive_ref, source_path, size_bytes) =
            if let Some((entry_name, size_bytes)) = matching_entry {
                if size_bytes > MAX_SOURCE_FILE_BYTES {
                    return Err(AppError::Validation(
                        "MRPACK内ファイルが安全上限を超えています".into(),
                    ));
                }
                (
                    Some(ArchiveArtifactRef {
                        archive_path: source.to_path_buf(),
                        entry_name,
                    }),
                    None,
                    size_bytes,
                )
            } else {
                (
                    None,
                    None,
                    file.hashes.get("sha512").and_then(|_| Some(0)).unwrap_or(0),
                )
            };
        let is_local = archive_ref.is_some();
        let role_hint = file.env.as_ref().and_then(classify_modrinth_env);
        let expected_sha256 = file.hashes.get("sha256").cloned();
        let file_name = Path::new(&relative)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let (project_id, version_id) = file
            .downloads
            .first()
            .map(|url| modrinth_ids(url))
            .unwrap_or((None, None));
        let (provider, file_id) = ("modrinth".into(), None);
        let acquisition = if is_local {
            local_acquisition(relative.clone())
        } else {
            ModpackAcquisition {
                method: "provider-download".into(),
                source: "Modrinth official file record".into(),
                requires_network: true,
                instructions: file
                    .downloads
                    .first()
                    .map(|_| "Modrinthの公式ファイルページから取得してください".into()),
            }
        };
        if !is_local && file_name.to_ascii_lowercase().ends_with(".jar") {
            inventory.unresolved.push(ModpackUnresolvedDependency {
                id: relative.clone(),
                required: true,
                side: role_hint.clone().unwrap_or_else(|| "unknown".into()),
                reason: "Modrinth .mrpackにJARが同梱されていません。公式ファイルの取得が必要です"
                    .into(),
                provider: Some("modrinth".into()),
                project_id: project_id.clone(),
                file_id: file_id.clone(),
            });
        }
        inventory.artifacts.push(SourceArtifact {
            relative: relative.clone(),
            source_path,
            archive_ref,
            file_name,
            size_bytes,
            provider,
            project_id,
            file_id,
            version_id,
            version_number: None,
            expected_sha256,
            role_hint,
            acquisition,
            redistributable: is_local,
            dependencies: Vec::new(),
        });
    }
    for (key, value) in index.dependencies {
        if matches!(
            key.as_str(),
            "minecraft" | "fabric-loader" | "quilt-loader" | "forge" | "neoforge"
        ) {
            continue;
        }
        if !inventory.artifacts.iter().any(|artifact| {
            artifact
                .file_name
                .to_ascii_lowercase()
                .contains(&key.to_ascii_lowercase())
        }) {
            inventory.unresolved.push(ModpackUnresolvedDependency {
                id: key,
                required: true,
                side: "both".into(),
                reason: format!("依存 {value} のローカルファイルがありません"),
                provider: Some("modrinth".into()),
                project_id: None,
                file_id: None,
            });
        }
    }
    inventory.overrides = list_archive_paths(archive, "overrides/")?;
    inventory.configs = inventory
        .overrides
        .iter()
        .filter(|path| is_config_path(path))
        .cloned()
        .collect();
    Ok(inventory)
}

fn apply_curseforge_target(manifest: &CurseForgeManifest, inventory: &mut SourceInventory) {
    let Some(minecraft) = manifest.minecraft.as_ref() else {
        return;
    };
    let loader = minecraft
        .mod_loaders
        .iter()
        .find(|item| item.primary)
        .or_else(|| minecraft.mod_loaders.first());
    let (loader_name, loader_version) = loader
        .map(|item| {
            let mut split = item.id.splitn(2, '-');
            (
                split.next().unwrap_or("unknown").to_string(),
                split.next().map(ToString::to_string),
            )
        })
        .unwrap_or_else(|| ("unknown".into(), None));
    inventory.target = Some(ModpackAnalyzeTarget {
        game: "minecraft-java".into(),
        minecraft_version: minecraft.version.clone().unwrap_or_default(),
        loader: loader_name,
        loader_version,
        java_major: 0,
    });
}

fn modrinth_target(dependencies: &BTreeMap<String, String>) -> Option<ModpackAnalyzeTarget> {
    let minecraft = dependencies.get("minecraft")?.clone();
    let (loader, version) = ["fabric-loader", "quilt-loader", "forge", "neoforge"]
        .iter()
        .find_map(|name| {
            dependencies
                .get(*name)
                .map(|value| ((*name).replace("-loader", ""), value.clone()))
        })?;
    Some(ModpackAnalyzeTarget {
        game: "minecraft-java".into(),
        minecraft_version: minecraft,
        loader,
        loader_version: Some(version),
        java_major: 0,
    })
}

fn modrinth_ids(url: &str) -> (Option<String>, Option<String>) {
    let parts = url.split('/').collect::<Vec<_>>();
    let Some(data_index) = parts.iter().position(|part| *part == "data") else {
        return (None, None);
    };
    let project = parts
        .get(data_index + 1)
        .filter(|value| !value.is_empty())
        .map(|value| (*value).to_string());
    let version = parts
        .get(data_index + 2)
        .filter(|value| !value.is_empty())
        .map(|value| (*value).to_string());
    (project, version)
}

fn classify_modrinth_env(environment: &ModrinthEnvironment) -> Option<String> {
    match (
        environment.client.as_deref().unwrap_or("required"),
        environment.server.as_deref().unwrap_or("required"),
    ) {
        ("unsupported", "required") => Some("server-only".into()),
        ("required", "unsupported") => Some("client-only".into()),
        ("optional", "required") | ("required", "optional") => Some("client-optional".into()),
        ("required", "required") | ("optional", "optional") => Some("both".into()),
        _ => None,
    }
}

fn inspect_jar_bytes_owned(bytes: Vec<u8>) -> AppResult<JarInspection> {
    if bytes.len() as u64 > MAX_LOCAL_JAR_BYTES {
        return Err(AppError::Validation("JARが安全上限を超えています".into()));
    }
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| AppError::Validation(format!("JARを読み取れません: {error}")))?;
    validate_archive(&mut archive, 0)?;
    let mut result = JarInspection::default();
    if let Some(metadata) =
        read_zip_entry_optional(&mut archive, "fabric.mod.json", MAX_METADATA_BYTES)?
    {
        let value: serde_json::Value = serde_json::from_slice(&metadata).map_err(|error| {
            AppError::Validation(format!("fabric.mod.jsonを読み取れません: {error}"))
        })?;
        if let Some(id) = value.get("id").and_then(|value| value.as_str()) {
            result.ids.push(id.into());
        }
        result.version = value.get("version").and_then(value_to_string);
        if let Some(environment) = value.get("environment").and_then(|value| value.as_str()) {
            result.role = fabric_role(environment);
            result
                .evidence
                .push(format!("strong:fabric-environment-{environment}"));
        }
        if let Some(depends) = value.get("depends").and_then(|value| value.as_object()) {
            for (id, version) in depends {
                if id == "minecraft" {
                    continue;
                }
                result.dependencies.push(ModpackDependency {
                    id: id.clone(),
                    required: true,
                    side: "both".into(),
                    version_range: value_to_string(version),
                    resolved: false,
                });
            }
        }
    }
    for name in ["META-INF/mods.toml", "META-INF/neoforge.mods.toml"] {
        if let Some(metadata) = read_zip_entry_optional(&mut archive, name, MAX_METADATA_BYTES)? {
            let text = String::from_utf8_lossy(&metadata);
            parse_toml_mods(&text, &mut result);
        }
    }
    result.ids.sort();
    result.ids.dedup();
    if result.role.is_none() && !result.ids.is_empty() {
        result.role = Some("unknown".into());
    }
    Ok(result)
}

fn fabric_role(environment: &str) -> Option<String> {
    match environment.to_ascii_lowercase().as_str() {
        "client" => Some("client-only".into()),
        "server" => Some("server-only".into()),
        "*" | "both" => Some("both".into()),
        "server_only_client_optional" | "client_optional" => Some("client-optional".into()),
        _ => None,
    }
}

fn parse_toml_mods(text: &str, result: &mut JarInspection) {
    let mut current_id = None::<String>;
    let mut current_side = None::<String>;
    for line in text.lines() {
        let trimmed = line.split('#').next().unwrap_or("").trim();
        if trimmed.starts_with("[[mods]]") {
            current_id = None;
            current_side = None;
        }
        if let Some((key, value)) = trimmed.split_once('=') {
            let key = key.trim();
            let value = value.trim().trim_matches('"').trim_matches('\'');
            match key {
                "modId" => {
                    current_id = Some(value.into());
                    result.ids.push(value.into());
                }
                "version" => {
                    if result.version.is_none() {
                        result.version = Some(value.into());
                    }
                }
                "side" => {
                    current_side = Some(value.into());
                    if let Some(role) = side_role(value) {
                        result
                            .evidence
                            .push(format!("strong:forge-side-{}", value.to_ascii_lowercase()));
                        result.role = merge_role(result.role.take(), role);
                    }
                }
                _ => {}
            }
        }
        if let Some(id) = trimmed
            .strip_prefix("modId=")
            .map(|value| value.trim().trim_matches('"').to_string())
        {
            current_id = Some(id);
        }
        if trimmed.contains("mandatory=true") {
            if let Some(id) = current_id.clone() {
                result.dependencies.push(ModpackDependency {
                    id,
                    required: true,
                    side: current_side.clone().unwrap_or_else(|| "both".into()),
                    version_range: None,
                    resolved: false,
                });
            }
        }
    }
}

fn side_role(value: &str) -> Option<String> {
    match value.to_ascii_lowercase().as_str() {
        "client" => Some("client-only".into()),
        "server" => Some("server-only".into()),
        "both" | "*" => Some("both".into()),
        _ => None,
    }
}
fn merge_role(current: Option<String>, next: String) -> Option<String> {
    match current.as_deref() {
        None => Some(next),
        Some(value) if value == next => Some(next),
        Some(_) => Some("unknown".into()),
    }
}
fn value_to_string(value: &serde_json::Value) -> Option<String> {
    value
        .as_str()
        .map(ToString::to_string)
        .or_else(|| value.as_i64().map(|value| value.to_string()))
}

fn merge_dependencies(
    pack_dependencies: &[ModpackDependency],
    jar_dependencies: &[ModpackDependency],
) -> Vec<ModpackDependency> {
    let mut merged = Vec::with_capacity(pack_dependencies.len() + jar_dependencies.len());
    for dependency in pack_dependencies.iter().chain(jar_dependencies) {
        if let Some(existing) = merged.iter_mut().find(|existing: &&mut ModpackDependency| {
            existing.id.eq_ignore_ascii_case(&dependency.id)
        }) {
            existing.required |= dependency.required;
            if existing.version_range.is_none() {
                existing.version_range = dependency.version_range.clone();
            }
            if !existing.side.eq_ignore_ascii_case(&dependency.side) {
                existing.side = "both".into();
            }
        } else {
            merged.push(dependency.clone());
        }
    }
    merged
}

fn validate_archive<R: Read + Seek>(archive: &mut ZipArchive<R>, depth: u8) -> AppResult<()> {
    if archive.len() == 0 || archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(AppError::Validation(format!(
            "ZIPの項目数が安全上限{MAX_ARCHIVE_ENTRIES}件を超えています"
        )));
    }
    if depth > MAX_NESTED_ARCHIVE_DEPTH {
        return Err(AppError::Validation(
            "入れ子ZIPの深度が安全上限を超えています".into(),
        ));
    }
    let mut total = 0u64;
    let mut names = HashSet::new();
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(zip_error)?;
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(AppError::Validation(
                "ZIP内のシンボリックリンクを拒否しました".into(),
            ));
        }
        let relative = normalize_relative_name(entry.name())?;
        if !names.insert(relative.to_ascii_lowercase()) {
            return Err(AppError::Validation(
                "ZIP内に大文字小文字だけが異なる重複パスがあります".into(),
            ));
        }
        if entry.is_dir() {
            continue;
        }
        let size = entry.size();
        let compressed = entry.compressed_size();
        if size > MAX_ARCHIVE_ENTRY_BYTES {
            return Err(AppError::Validation(
                "ZIP内の単一展開サイズが安全上限を超えています".into(),
            ));
        }
        total = total
            .checked_add(size)
            .ok_or_else(|| AppError::Validation("ZIPの合計展開サイズが不正です".into()))?;
        if total > MAX_ARCHIVE_TOTAL_BYTES {
            return Err(AppError::Validation(
                "ZIPの合計展開サイズが安全上限を超えています".into(),
            ));
        }
        let ratio_limit = compressed
            .checked_mul(MAX_COMPRESSION_RATIO)
            .ok_or_else(|| {
                AppError::Validation("ZIPの圧縮比計算がオーバーフローしました".into())
            })?;
        if (compressed == 0 && size > 0) || (compressed > 0 && size > ratio_limit) {
            return Err(AppError::Validation(
                "ZIPの圧縮比が安全上限を超えています".into(),
            ));
        }
        if depth < MAX_NESTED_ARCHIVE_DEPTH
            && is_archive_path(&relative)
            && size <= MAX_METADATA_BYTES
        {
            let mut bytes = Vec::with_capacity(size as usize);
            entry.read_to_end(&mut bytes).map_err(AppError::Io)?;
            if let Ok(mut nested) = ZipArchive::new(Cursor::new(bytes)) {
                validate_archive(&mut nested, depth + 1)?;
            }
        }
    }
    Ok(())
}

fn read_zip_entry<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    name: &str,
    limit: u64,
) -> AppResult<Vec<u8>> {
    let mut entry = archive.by_name(name).map_err(zip_error)?;
    if entry.size() > limit {
        return Err(AppError::Validation(format!(
            "ZIP内の{name}が安全上限を超えています"
        )));
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry.read_to_end(&mut bytes).map_err(AppError::Io)?;
    if bytes.len() as u64 != entry.size() {
        return Err(AppError::Validation(format!(
            "ZIP内の {name} のサイズが不正です"
        )));
    }
    Ok(bytes)
}

fn read_archive_entry_from_path(path: &Path, name: &str, limit: u64) -> AppResult<Vec<u8>> {
    read_archive_entry_optional_from_path(path, name, limit)?.ok_or(AppError::NotFound)
}

fn read_archive_entry_optional_from_path(
    path: &Path,
    name: &str,
    limit: u64,
) -> AppResult<Option<Vec<u8>>> {
    reject_symlink(path)?;
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file).map_err(zip_error)?;
    read_zip_entry_optional(&mut archive, name, limit)
}

fn read_zip_entry_optional<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    name: &str,
    limit: u64,
) -> AppResult<Option<Vec<u8>>> {
    match archive.by_name(name) {
        Ok(mut entry) => {
            if entry.size() > limit {
                return Err(AppError::Validation(format!(
                    "ZIP内の{name}が安全上限を超えています"
                )));
            }
            let mut bytes = Vec::with_capacity(entry.size() as usize);
            entry.read_to_end(&mut bytes).map_err(AppError::Io)?;
            Ok(Some(bytes))
        }
        Err(zip::result::ZipError::FileNotFound) => Ok(None),
        Err(error) => Err(zip_error(error)),
    }
}
fn list_archive_paths<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    prefix: &str,
) -> AppResult<Vec<String>> {
    let mut paths = Vec::new();
    for index in 0..archive.len() {
        let name = normalize_relative_name(archive.by_index(index).map_err(zip_error)?.name())?;
        if name.starts_with(prefix) && !name.ends_with('/') {
            let relative = name.trim_start_matches(prefix);
            paths.push(relative.into());
        }
    }
    paths.sort();
    paths.dedup();
    Ok(paths)
}
fn normalize_relative_name(value: &str) -> AppResult<String> {
    if value.is_empty()
        || value.contains('\0')
        || value.starts_with('/')
        || value.starts_with('\\')
        || value.contains(':')
    {
        return Err(AppError::Validation(
            "ZIP内に絶対パスまたはADSパスがあります".into(),
        ));
    }
    let path = Path::new(value);
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
    {
        return Err(AppError::Validation(
            "ZIP内にパストラバーサルがあります".into(),
        ));
    }
    let normalized = value.replace('\\', "/");
    let is_directory = normalized.ends_with('/');
    let trimmed = normalized.trim_end_matches('/');
    if trimmed.is_empty()
        || trimmed
            .split('/')
            .any(|part| part.is_empty() || part == ".")
    {
        return Err(AppError::Validation("ZIP内のパス形式が不正です".into()));
    }
    Ok(if is_directory {
        format!("{}/", trimmed)
    } else {
        trimmed.to_string()
    })
}
fn safe_relative(value: &str) -> AppResult<PathBuf> {
    let normalized = normalize_relative_name(value)?;
    Ok(PathBuf::from(normalized))
}
fn safe_file_name(value: &str) -> AppResult<String> {
    let name = Path::new(value)
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();
    if name.is_empty() || name.contains(':') || name == "." || name == ".." {
        return Err(AppError::Validation(
            "JARファイル名が安全ではありません".into(),
        ));
    }
    Ok(name)
}
fn is_archive_path(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.ends_with(".zip") || lower.ends_with(".jar") || lower.ends_with(".mrpack")
}
fn is_jar_path(value: &str) -> bool {
    value.to_ascii_lowercase().ends_with(".jar")
}
fn is_config_path(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.starts_with("config/")
        || lower.starts_with("defaultconfigs/")
        || lower.starts_with("kubejs/")
        || lower.starts_with("scripts/")
        || lower.starts_with("overrides/")
}

fn list_safe_config_paths(root: &Path) -> AppResult<Vec<String>> {
    let mut paths = Vec::new();
    for entry in walk_files(root)? {
        let relative = entry
            .strip_prefix(root)
            .map_err(|_| AppError::Validation("相対パスを解決できません".into()))?
            .to_string_lossy()
            .replace('\\', "/");
        if is_config_path(&relative) {
            paths.push(relative);
        }
    }
    paths.sort();
    paths.dedup();
    Ok(paths)
}
fn list_safe_override_paths(root: &Path) -> AppResult<Vec<String>> {
    let mut paths = Vec::new();
    let overrides = root.join("overrides");
    if !overrides.is_dir() {
        return Ok(paths);
    }
    for entry in walk_files(&overrides)? {
        let relative = entry
            .strip_prefix(&overrides)
            .map_err(|_| AppError::Validation("override相対パスを解決できません".into()))?
            .to_string_lossy()
            .replace('\\', "/");
        safe_relative(&relative)?;
        paths.push(relative);
    }
    paths.sort();
    paths.dedup();
    Ok(paths)
}
fn walk_files(root: &Path) -> AppResult<Vec<PathBuf>> {
    let mut output = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(current) = stack.pop() {
        for entry in fs::read_dir(&current)? {
            let entry = entry?;
            reject_symlink(&entry.path())?;
            if entry.file_type()?.is_dir() {
                stack.push(entry.path());
            } else if entry.file_type()?.is_file() {
                output.push(entry.path());
            }
        }
    }
    output.sort();
    Ok(output)
}
fn reject_symlink(path: &Path) -> AppResult<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(AppError::Validation(
            "シンボリックリンクを含むModパックは安全のため拒否しました".into(),
        )),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Err(AppError::NotFound),
        Err(error) => Err(error.into()),
    }
}
fn read_bounded_path(path: &Path, limit: u64) -> AppResult<Vec<u8>> {
    reject_symlink(path)?;
    let metadata = fs::metadata(path)?;
    if metadata.len() > limit {
        return Err(AppError::Validation(
            "入力ファイルが安全上限を超えています".into(),
        ));
    }
    let mut file = File::open(path)?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.read_to_end(&mut bytes)?;
    Ok(bytes)
}
fn local_acquisition(relative: String) -> ModpackAcquisition {
    ModpackAcquisition {
        method: "local-file".into(),
        source: relative,
        requires_network: false,
        instructions: None,
    }
}
fn safe_display_name(value: Option<&str>, fallback: &str) -> String {
    let normalized = value.unwrap_or(fallback).replace('\\', "/");
    let candidate = normalized.rsplit('/').next().unwrap_or(fallback).trim();
    if candidate.is_empty() || candidate == "." || candidate == ".." || candidate.contains(':') {
        fallback
            .replace('\\', "/")
            .rsplit('/')
            .next()
            .unwrap_or("Modpack")
            .to_string()
    } else {
        candidate.to_string()
    }
}
fn default_target() -> ModpackAnalyzeTarget {
    ModpackAnalyzeTarget {
        game: "minecraft-java".into(),
        minecraft_version: String::new(),
        loader: String::new(),
        loader_version: None,
        java_major: 0,
    }
}
fn zip_error(error: zip::result::ZipError) -> AppError {
    AppError::Validation(format!("ZIPエントリーを読み取れません: {error}"))
}

fn fingerprint(plan: &ModpackPlan) -> AppResult<String> {
    let mut canonical = plan.clone();
    canonical.plan_fingerprint.clear();
    Ok(hex::encode(Sha256::digest(serde_json::to_vec(&canonical)?)))
}

fn validate_destination(destination: &Path) -> AppResult<()> {
    if !destination.is_absolute() {
        return Err(AppError::Validation(
            "新規構成の保存先は絶対パスで指定してください".into(),
        ));
    }
    reject_symlink_if_present(destination)?;
    let parent = destination
        .parent()
        .ok_or_else(|| AppError::Validation("保存先の親フォルダーを解決できません".into()))?;
    let destination_name = destination
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();
    if destination_name.is_empty()
        || destination_name == "."
        || destination_name == ".."
        || destination_name.contains(':')
    {
        return Err(AppError::Validation(
            "新規構成の保存先名が安全ではありません".into(),
        ));
    }
    if !parent.as_os_str().is_empty() {
        reject_symlink_if_present(parent)?;
        if !parent.is_dir() {
            return Err(AppError::Validation(
                "新規構成の親フォルダーがありません".into(),
            ));
        }
    }
    if destination.exists() {
        if !destination.is_dir() {
            return Err(AppError::Validation(
                "新規構成の保存先がフォルダーではありません".into(),
            ));
        }
        if destination.read_dir()?.next().is_some() {
            return Err(AppError::Validation(
                "既存ファイルを保護するため、空ではない保存先への作成を拒否しました".into(),
            ));
        }
    }
    Ok(())
}

fn reject_destination_overlap(source: &Path, destination: &Path) -> AppResult<()> {
    if !source.is_dir() {
        return Ok(());
    }
    let source_absolute = fs::canonicalize(source)?;
    let destination_absolute = if destination.exists() {
        fs::canonicalize(destination)?
    } else {
        let parent = destination
            .parent()
            .ok_or_else(|| AppError::Validation("保存先の親フォルダーを解決できません".into()))?;
        fs::canonicalize(parent)?.join(
            destination
                .file_name()
                .ok_or_else(|| AppError::Validation("保存先名がありません".into()))?,
        )
    };
    if destination_absolute == source_absolute || destination_absolute.starts_with(&source_absolute)
    {
        return Err(AppError::Validation(
            "入力フォルダー自身またはその配下を保存先には指定できません".into(),
        ));
    }
    Ok(())
}
fn staging_path(destination: &Path) -> AppResult<PathBuf> {
    let parent = destination
        .parent()
        .ok_or_else(|| AppError::Validation("保存先の親フォルダーを解決できません".into()))?;
    let name = destination
        .file_name()
        .ok_or_else(|| AppError::Validation("保存先名がありません".into()))?
        .to_string_lossy();
    Ok(parent.join(format!(".{name}.tomonode-stage-{}", Uuid::new_v4())))
}

fn read_local_artifact(
    source: &Path,
    relative: &Path,
    artifact: &ModpackArtifactPlan,
    archive_ref: Option<&ArchiveArtifactRef>,
) -> AppResult<Vec<u8>> {
    if source.is_dir() {
        let path = source.join(relative);
        let bytes = read_bounded_path(&path, MAX_LOCAL_JAR_BYTES)?;
        return Ok(bytes);
    }
    if let Some(archive_ref) = archive_ref {
        return read_archive_entry_from_path(
            &archive_ref.archive_path,
            &archive_ref.entry_name,
            MAX_LOCAL_JAR_BYTES,
        );
    }
    let name = relative.to_string_lossy().replace('\\', "/");
    for candidate in [
        name.clone(),
        format!("overrides/{name}"),
        format!("client-overrides/{name}"),
        format!("server-overrides/{name}"),
    ] {
        if let Some(bytes) =
            read_archive_entry_optional_from_path(source, &candidate, MAX_LOCAL_JAR_BYTES)?
        {
            return Ok(bytes);
        }
    }
    let _ = artifact;
    Err(AppError::Validation(
        "計画内のローカルJARを読み取れません".into(),
    ))
}

fn reject_symlink_if_present(path: &Path) -> AppResult<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(AppError::Validation(
            "シンボリックリンクの保存先は安全のため使用できません".into(),
        )),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn write_import_state(destination: &Path, plan: &ModpackPlan) -> AppResult<()> {
    let mut artifacts = Vec::new();
    let mut server = Vec::new();
    for artifact in &plan.artifacts {
        if !artifact.stage_eligible {
            continue;
        }
        let artifact_id = artifact.artifact_id.clone();
        server.push(artifact_id.clone());
        artifacts.push(ModManagementArtifact { artifact_id, file_name: artifact.file_name.clone(), kind: "mod".into(), active: true, present: true, top_level_mods: Vec::new(), embedded: Vec::new(), role: artifact.role.clone(), role_evidence: artifact.role_evidence.clone(), dependencies: artifact.dependencies.iter().map(|dependency| serde_json::json!({"id": dependency.id, "required": dependency.required, "side": dependency.side, "versionRange": dependency.version_range, "resolved": dependency.resolved})).collect(), origin: ModManagementOrigin { provider: artifact.provider.clone(), project_id: artifact.project_id.clone(), version_id: artifact.version_id.clone(), version_number: artifact.version_number.clone(), source: Some(artifact.acquisition.source.clone()), dependency: false, manifest_path: Some(artifact.source_relative_path.clone()) } });
    }
    let state = ModManagementState {
        schema_version: MOD_MANAGEMENT_SCHEMA_VERSION,
        server_id: format!(
            "import-{}",
            &plan.plan_fingerprint[..16.min(plan.plan_fingerprint.len())]
        ),
        target: plan.target.clone().into(),
        desired_sets: ModManagementDesiredSets {
            server,
            client: Vec::new(),
            optional_client: Vec::new(),
        },
        role_overrides: Vec::new(),
        artifacts,
        last_successful_launch: None,
        updated_at: Utc::now().to_rfc3339(),
    };
    let path = destination.join(".server-hub/mod-management/state.json");
    let parent = path
        .parent()
        .ok_or_else(|| AppError::Validation("state保存先を解決できません".into()))?;
    fs::create_dir_all(parent)?;
    let bytes = serde_json::to_vec_pretty(&state)?;
    let temp = parent.join(format!(".state.json.tmp-{}", Uuid::new_v4()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    fs::rename(&temp, &path).map_err(AppError::Io)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    use zip::{ZipWriter, write::SimpleFileOptions};

    fn temp_root(label: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("tomonode-m4-{label}-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        root
    }
    fn zip_bytes(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut writer = ZipWriter::new(cursor);
        for (name, bytes) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }
    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
        fs::write(path, zip_bytes(entries)).unwrap();
    }
    fn fabric_jar(id: &str, environment: &str) -> Vec<u8> {
        zip_bytes(&[("fabric.mod.json", format!(r#"{{"schemaVersion":1,"id":"{id}","version":"1.0.0","environment":"{environment}"}}"#).as_bytes())])
    }
    fn fabric_jar_unknown(id: &str) -> Vec<u8> {
        zip_bytes(&[(
            "fabric.mod.json",
            format!(r#"{{"schemaVersion":1,"id":"{id}","version":"1.0.0"}}"#).as_bytes(),
        )])
    }

    fn fabric_jar_with_dependency(id: &str, dependency: &str) -> Vec<u8> {
        zip_bytes(&[(
            "fabric.mod.json",
            format!(r#"{{"schemaVersion":1,"id":"{id}","version":"1.0.0","environment":"server","depends":{{"{dependency}":">=1.0.0"}}}}"#).as_bytes(),
        )])
    }

    #[test]
    fn rejects_traversal_absolute_ads_and_symlink_entries() {
        let root = temp_root("unsafe");
        for name in ["../escape.jar", "/absolute.jar", "folder:secret.jar"] {
            let source = root.join(format!("{}.zip", name.replace(['/', '\\', ':'], "_")));
            write_zip(&source, &[(name, b"x")]);
            assert!(analyze(&source, None).is_err(), "{name}");
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn analyses_mrpack_without_extracting_and_excludes_unknown_from_stage() {
        let root = temp_root("mrpack");
        let source = root.join("pack.mrpack");
        let local = fabric_jar("servermod", "server");
        let index = br#"{"formatVersion":1,"name":"Test","dependencies":{"minecraft":"1.20.1","fabric-loader":"0.15.0"},"files":[{"path":"mods/server.jar","hashes":{},"downloads":["https://example.invalid/server.jar"],"env":{"client":"unsupported","server":"required"}},{"path":"mods/client.jar","hashes":{},"downloads":[],"env":{"client":"required","server":"unsupported"}}]}"#;
        write_zip(
            &source,
            &[
                ("modrinth.index.json", index),
                ("overrides/mods/server.jar", &local),
            ],
        );
        let plan = analyze(&source, None).unwrap();
        assert_eq!(plan.source_kind, "modrinth-mrpack");
        assert_eq!(plan.artifacts.len(), 2);
        assert!(
            plan.artifacts
                .iter()
                .any(|item| item.role == "server-only" && item.stage_eligible)
        );
        assert!(
            plan.artifacts
                .iter()
                .any(|item| item.role == "client-only" && !item.stage_eligible)
        );
        assert!(plan.safety.read_only_analysis);
        assert!(!plan.plan_fingerprint.is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn creates_only_in_empty_destination_and_rolls_back_on_mismatch() {
        let root = temp_root("create");
        let source = root.join("mods");
        fs::create_dir_all(&source).unwrap();
        let jar = source.join("server.jar");
        fs::write(&jar, fabric_jar("servermod", "server")).unwrap();
        let plan = analyze(&source, None).unwrap();
        let destination = root.join("new");
        let error =
            create_new_configuration(&source, &destination, &plan.plan_fingerprint, "wrong", None)
                .unwrap_err();
        assert!(error.to_string().contains("CREATE MODPACK"));
        assert!(!destination.exists());
        let confirmation = format!("{MODPACK_CONFIRM_PREFIX} {}", plan.plan_fingerprint);
        let result = create_new_configuration(
            &source,
            &destination,
            &plan.plan_fingerprint,
            &confirmation,
            None,
        )
        .unwrap();
        assert_eq!(result.staged_artifacts, 1);
        assert!(destination.join("mods/server.jar").is_file());
        assert!(
            destination
                .join(".server-hub/mod-management/state.json")
                .is_file()
        );
        assert_eq!(
            fs::read(&jar).unwrap(),
            fs::read(source.join("server.jar")).unwrap()
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn classifies_curseforge_server_both_and_unknown_without_copying_client_or_unknown() {
        let root = temp_root("curseforge");
        let source = root.join("export.zip");
        let server = fabric_jar("dedicated", "server");
        let both = fabric_jar("shared", "*");
        let unknown = fabric_jar_unknown("mystery");
        let manifest = br#"{"minecraft":{"version":"1.20.1","modLoaders":[{"id":"forge-47.4.10","primary":true}]},"files":[],"name":"Fixture"}"#;
        write_zip(
            &source,
            &[
                ("manifest.json", manifest),
                ("overrides/mods/server.jar", &server),
                ("overrides/mods/both.jar", &both),
                ("overrides/mods/unknown.jar", &unknown),
                ("overrides/config/example.toml", b"secret=false"),
            ],
        );
        let plan = analyze(&source, None).unwrap();
        assert_eq!(plan.target.loader, "forge");
        assert_eq!(plan.target.loader_version.as_deref(), Some("47.4.10"));
        let public_json = serde_json::to_string(&plan).unwrap();
        assert!(!public_json.contains(&root.display().to_string()));
        assert!(
            plan.overrides
                .iter()
                .any(|path| path == "config/example.toml")
        );
        assert!(
            plan.artifacts
                .iter()
                .any(|item| item.role == "server-only" && item.stage_eligible)
        );
        assert!(
            plan.artifacts
                .iter()
                .any(|item| item.role == "both" && item.stage_eligible)
        );
        assert!(
            plan.artifacts
                .iter()
                .any(|item| item.role == "unknown" && !item.stage_eligible)
        );
        let destination = root.join("new");
        let confirmation = format!("{MODPACK_CONFIRM_PREFIX} {}", plan.plan_fingerprint);
        let result = create_new_configuration(
            &source,
            &destination,
            &plan.plan_fingerprint,
            &confirmation,
            None,
        )
        .unwrap();
        assert_eq!(result.staged_artifacts, 2);
        assert!(destination.join("mods/server.jar").is_file());
        assert!(destination.join("mods/both.jar").is_file());
        assert!(!destination.join("mods/unknown.jar").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_zip_bomb_ratio_and_non_empty_destination_without_touching_source() {
        let root = temp_root("limits");
        let bomb = root.join("bomb.zip");
        let zeros = vec![0u8; 2 * 1024 * 1024];
        write_zip(
            &bomb,
            &[
                ("manifest.json", br#"{}"#),
                ("overrides/", b""),
                ("overrides/huge.bin", &zeros),
            ],
        );
        assert!(analyze(&bomb, None).is_err());

        let source = root.join("mods");
        fs::create_dir_all(&source).unwrap();
        let jar = source.join("server.jar");
        let original = fabric_jar("server", "server");
        fs::write(&jar, &original).unwrap();
        let plan = analyze(&source, None).unwrap();
        let destination = root.join("not-empty");
        fs::create_dir_all(&destination).unwrap();
        fs::write(destination.join("keep.txt"), b"keep").unwrap();
        let confirmation = format!("{MODPACK_CONFIRM_PREFIX} {}", plan.plan_fingerprint);
        assert!(
            create_new_configuration(
                &source,
                &destination,
                &plan.plan_fingerprint,
                &confirmation,
                None,
            )
            .is_err()
        );
        assert_eq!(fs::read(&jar).unwrap(), original);
        assert_eq!(fs::read(destination.join("keep.txt")).unwrap(), b"keep");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn jar_metadata_dependencies_are_merged_and_block_staging_when_missing() {
        let root = temp_root("jar-dependency");
        let source = root.join("mods");
        fs::create_dir_all(&source).unwrap();
        fs::write(
            source.join("server.jar"),
            fabric_jar_with_dependency("server", "required-library"),
        )
        .unwrap();

        let plan = analyze(&source, None).unwrap();
        let artifact = plan
            .artifacts
            .iter()
            .find(|artifact| artifact.file_name == "server.jar")
            .unwrap();
        assert!(!artifact.stage_eligible);
        assert!(artifact.unresolved);
        assert!(
            artifact
                .dependencies
                .iter()
                .any(|dependency| { dependency.id == "required-library" && !dependency.resolved })
        );
        assert!(
            plan.unresolved_dependencies
                .iter()
                .any(|dependency| dependency.id == "required-library")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn requires_absolute_destination_and_rejects_source_or_descendant() {
        let root = temp_root("destination-safety");
        let source = root.join("mods");
        fs::create_dir_all(&source).unwrap();
        let jar = source.join("server.jar");
        fs::write(&jar, fabric_jar("server", "server")).unwrap();
        let plan = analyze(&source, None).unwrap();
        let confirmation = format!("{MODPACK_CONFIRM_PREFIX} {}", plan.plan_fingerprint);

        let relative_destination = Path::new("relative-destination");
        let error = create_new_configuration(
            &source,
            relative_destination,
            &plan.plan_fingerprint,
            &confirmation,
            None,
        )
        .unwrap_err();
        assert!(error.to_string().contains("絶対パス"));

        assert!(
            create_new_configuration(
                &source,
                &source,
                &plan.plan_fingerprint,
                &confirmation,
                None,
            )
            .is_err()
        );

        let descendant = source.join("nested-destination");
        let error = create_new_configuration(
            &source,
            &descendant,
            &plan.plan_fingerprint,
            &confirmation,
            None,
        )
        .unwrap_err();
        assert!(error.to_string().contains("自身またはその配下"));
        assert!(!descendant.exists());
        assert_eq!(
            fs::read(&jar).unwrap(),
            fs::read(source.join("server.jar")).unwrap()
        );
        fs::remove_dir_all(root).unwrap();
    }
}
