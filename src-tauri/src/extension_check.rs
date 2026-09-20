use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io::{Cursor, Read, Seek},
    path::{Path, PathBuf},
};

use chrono::Utc;
use regex::Regex;
use zip::ZipArchive;

use crate::{
    error::AppResult,
    models::{ExtensionCheckItem, ExtensionCheckReport, ServerProfile},
};

#[derive(Default)]
struct Metadata {
    id: Option<String>,
    provided_ids: Vec<String>,
    minecraft: Option<String>,
    loader: Option<String>,
    dependencies: Vec<String>,
    client_required: bool,
    /// Some client-only Forge mods do not declare a `side = "CLIENT"`
    /// dependency.  Their own entrypoint still contains an explicit warning
    /// (for example RPG-HUD's "client-side-only" message), which is a strong
    /// enough signal to stop a dedicated-server launch before Forge crashes.
    client_only_marker: bool,
}

pub fn check(profile: &ServerProfile) -> AppResult<ExtensionCheckReport> {
    let root = Path::new(&profile.root_path);
    let mut files = Vec::<(PathBuf, String)>::new();
    for (folder, kind) in [
        (root.join("mods"), "mod"),
        (root.join("plugins"), "plugin"),
        (
            root.join(&profile.settings.world_name).join("datapacks"),
            "datapack",
        ),
    ] {
        if !folder.is_dir() {
            continue;
        }
        for entry in std::fs::read_dir(folder)?.flatten() {
            if entry.file_type().is_ok_and(|value| value.is_file()) {
                files.push((entry.path(), kind.into()));
            }
        }
    }
    let managed = managed_files(root)?;
    let mut items = Vec::new();
    let mut ids = HashMap::<String, Vec<String>>::new();
    let mut present_ids = HashSet::new();
    let mut parsed = Vec::new();
    for (path, kind) in &files {
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let metadata = inspect_archive(path, kind);
        let provided_ids = if metadata.provided_ids.is_empty() {
            metadata.id.clone().into_iter().collect::<Vec<_>>()
        } else {
            metadata.provided_ids.clone()
        };
        for id in provided_ids {
            let normalized = id.to_ascii_lowercase();
            present_ids.insert(normalized.clone());
            let files_for_id = ids.entry(normalized).or_default();
            if !files_for_id.iter().any(|value| value == &name) {
                files_for_id.push(name.clone());
            }
        }
        if let Some(loader) = metadata.loader.as_deref() {
            let expected = expected_loader(profile, kind);
            if loader != expected && loader != "universal" {
                items.push(item(
                    "error",
                    "loader-mismatch",
                    "ローダーが一致しません",
                    format!("{name} は {loader} 用ですが、このサーバーは {expected} です。"),
                    vec![name.clone()],
                    "対応するローダー版へ入れ替えてください",
                ));
            }
        }
        if let Some(version) = metadata.minecraft.as_deref() {
            if !version_matches(version, &profile.minecraft_version) {
                items.push(item(
                    "warning",
                    "minecraft-version",
                    "Minecraft版を再確認してください",
                    format!(
                        "{name} のメタデータは {version}、サーバーは {} です。",
                        profile.minecraft_version
                    ),
                    vec![name.clone()],
                    "配布元の対応バージョンを確認してください",
                ));
            }
        }
        if metadata.client_required {
            items.push(item(
                "info",
                "client-required",
                "参加者側にも必要なModです",
                format!("{name} はクライアント側にも導入が必要と記録されています。"),
                vec![name.clone()],
                "参加する友達へ同じ版を案内してください",
            ));
        }
        if metadata.client_only_marker
            && kind == "mod"
            && matches!(
                profile.server_type.as_str(),
                "fabric" | "forge" | "neoforge"
            )
        {
            items.push(item(
                "error",
                "client-only-mod",
                "専用サーバーにクライアント専用Modがあります",
                format!(
                    "{name} はクライアント専用であることを自身のコード内で示しています。Dedicated Serverのmodsフォルダーへ置くと起動時に終了する可能性があります。"
                ),
                vec![name.clone()],
                "このModをサーバーのmodsフォルダーから外し、必要なら参加者側のクライアントにだけ導入してください",
            ));
        }
        parsed.push((name, metadata));
    }
    for (id, duplicates) in ids {
        if duplicates.len() > 1 {
            items.push(item(
                "error",
                "duplicate-id",
                "同じMod／プラグインが重複しています",
                format!("ID「{id}」が{}件あります。", duplicates.len()),
                duplicates,
                "古い版または重複ファイルを無効化してください",
            ));
        }
    }
    for (name, metadata) in parsed {
        let missing = metadata
            .dependencies
            .into_iter()
            .filter(|value| {
                !built_in_dependency(value) && !present_ids.contains(&value.to_ascii_lowercase())
            })
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            items.push(item(
                "error",
                "missing-dependency",
                "必須依存が不足しています",
                format!("{name} に必要な {} が見つかりません。", missing.join(", ")),
                vec![name],
                "不足している依存Mod／プラグインを追加してください",
            ));
        }
    }
    for (path, _) in &files {
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        if !managed.contains(&name.to_ascii_lowercase()) {
            items.push(item(
                "info",
                "unmanaged-file",
                "手動追加ファイルです",
                format!("{name} は配布元IDを記録していないため、自動更新対象にしません。"),
                vec![name],
                "必要なら配布元で最新版と互換性を確認してください",
            ));
        }
    }
    items.sort_by_key(|value| match value.severity.as_str() {
        "error" => 0,
        "warning" => 1,
        _ => 2,
    });
    Ok(ExtensionCheckReport {
        checked_at: Utc::now().to_rfc3339(),
        blocking: items.iter().any(|value| value.severity == "error"),
        scanned_files: files.len(),
        managed_files: managed.len(),
        items,
        limitation: "JAR／ZIP内の公開メタデータとModrinth導入記録による事前検査です。実際のゲーム内競合や全Mod固有の条件を保証するものではありません。".into(),
    })
}

const MAX_NESTED_ARCHIVE_DEPTH: u8 = 2;
const MAX_NESTED_ARCHIVE_BYTES: u64 = 64 * 1024 * 1024;

fn inspect_archive(path: &Path, kind: &str) -> Metadata {
    if !matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("jar" | "zip")
    ) {
        return Metadata::default();
    }
    let Ok(file) = File::open(path) else {
        return Metadata::default();
    };
    let Ok(mut archive) = ZipArchive::new(file) else {
        return Metadata::default();
    };
    inspect_zip(&mut archive, kind, 0)
}

fn inspect_zip<R: Read + Seek>(archive: &mut ZipArchive<R>, kind: &str, depth: u8) -> Metadata {
    let mut metadata = inspect_zip_metadata(archive, kind);
    if depth == 0 && kind == "mod" {
        metadata.client_only_marker = archive_contains_client_only_marker(archive);
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
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        if entry.read_to_end(&mut bytes).is_err() {
            continue;
        }
        let Ok(mut nested) = ZipArchive::new(Cursor::new(bytes)) else {
            continue;
        };
        let nested_metadata = inspect_zip(&mut nested, kind, depth + 1);
        metadata.provided_ids.extend(nested_metadata.provided_ids);
        metadata.dependencies.extend(nested_metadata.dependencies);
    }
    metadata.provided_ids = unique_ids(metadata.provided_ids);
    metadata.dependencies = unique_ids(metadata.dependencies);
    metadata
}

const CLIENT_ONLY_MARKERS: [&[u8]; 4] = [
    b"client-side-only",
    b"client side only",
    b"client-only mod",
    b"should not be installed server-side",
];

/// Look for an explicit author-provided client-only marker in top-level class
/// files.  Merely referencing `net/minecraft/client` is not enough: healthy
/// server mods commonly bundle client classes behind a dist guard.  The
/// marker is intentionally conservative and only blocks when the mod itself
/// says it must not be installed on a server.
fn archive_contains_client_only_marker<R: Read + Seek>(archive: &mut ZipArchive<R>) -> bool {
    let class_names = archive
        .file_names()
        .filter(|name| name.to_ascii_lowercase().ends_with(".class"))
        .map(str::to_string)
        .collect::<Vec<_>>();
    for class_name in class_names {
        let Ok(mut entry) = archive.by_name(&class_name) else {
            continue;
        };
        if entry.size() > 8 * 1024 * 1024 {
            continue;
        }
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        if entry.read_to_end(&mut bytes).is_err() {
            continue;
        }
        let lowered = bytes
            .iter()
            .map(|value| value.to_ascii_lowercase())
            .collect::<Vec<_>>();
        if CLIENT_ONLY_MARKERS.iter().any(|marker| {
            lowered
                .windows(marker.len())
                .any(|window| window == *marker)
        }) {
            return true;
        }
    }
    false
}

fn inspect_zip_metadata<R: Read + Seek>(archive: &mut ZipArchive<R>, kind: &str) -> Metadata {
    if !matches!(kind, "mod" | "plugin" | "datapack") {
        return Metadata::default();
    }
    if let Some(value) = read_zip_text(archive, "fabric.mod.json", 1024 * 1024) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&value) {
            let id = json
                .get("id")
                .and_then(|value| value.as_str())
                .map(str::to_string);
            return Metadata {
                provided_ids: id.clone().into_iter().collect(),
                id,
                minecraft: json.pointer("/depends/minecraft").and_then(version_value),
                loader: Some("fabric".into()),
                dependencies: json
                    .get("depends")
                    .and_then(|value| value.as_object())
                    .map(|values| {
                        values
                            .keys()
                            .filter(|key| {
                                *key != "minecraft" && *key != "java" && *key != "fabricloader"
                            })
                            .cloned()
                            .collect()
                    })
                    .unwrap_or_default(),
                client_required: json
                    .get("environment")
                    .and_then(|value| value.as_str())
                    .is_some_and(|value| value == "client"),
                client_only_marker: false,
            };
        }
    }
    for (name, loader) in [
        ("META-INF/mods.toml", "forge"),
        ("META-INF/neoforge.mods.toml", "neoforge"),
    ] {
        if let Some(value) = read_zip_text(archive, name, 2 * 1024 * 1024) {
            return parse_forge_metadata(&value, loader);
        }
    }
    if kind == "plugin" {
        if let Some(value) = read_zip_text(archive, "plugin.yml", 1024 * 1024)
            .or_else(|| read_zip_text(archive, "paper-plugin.yml", 1024 * 1024))
        {
            let field = |name: &str| {
                Regex::new(&format!(r"(?m)^{}:\s*([^#\r\n]+)", regex::escape(name)))
                    .ok()
                    .and_then(|regex| regex.captures(&value))
                    .and_then(|capture| capture.get(1))
                    .map(|value| value.as_str().trim().trim_matches(['\'', '"']).to_string())
            };
            let id = field("name").map(|value| value.to_ascii_lowercase());
            let dependencies = field("depend")
                .map(|value| {
                    value
                        .trim_matches(['[', ']'])
                        .split(',')
                        .map(|item| item.trim().to_ascii_lowercase())
                        .filter(|item| !item.is_empty())
                        .collect()
                })
                .unwrap_or_default();
            return Metadata {
                id: id.clone(),
                provided_ids: id.into_iter().collect(),
                minecraft: field("api-version"),
                loader: Some("paper".into()),
                dependencies,
                client_required: false,
                client_only_marker: false,
            };
        }
    }
    Metadata::default()
}

#[derive(Copy, Clone, Eq, PartialEq)]
enum ForgeSection {
    Other,
    Mods,
    Dependency,
}

fn parse_forge_metadata(value: &str, loader: &str) -> Metadata {
    let mut section = ForgeSection::Other;
    let mut id = None;
    let mut minecraft = None;
    let mut dependencies = Vec::new();
    let mut dependency_id = None;
    let mut dependency_mandatory = true;
    let mut dependency_side = None;
    let mut dependency_version = None;

    let flush_dependency = |dependency_id: &mut Option<String>,
                            dependency_mandatory: &mut bool,
                            dependency_side: &mut Option<String>,
                            dependency_version: &mut Option<String>,
                            dependencies: &mut Vec<String>,
                            minecraft: &mut Option<String>| {
        let Some(value) = dependency_id.take() else {
            return;
        };
        if value.eq_ignore_ascii_case("minecraft") {
            if minecraft.is_none() {
                *minecraft = dependency_version.take();
            }
        } else if *dependency_mandatory
            && !dependency_side
                .as_deref()
                .is_some_and(|side| side.eq_ignore_ascii_case("client"))
        {
            dependencies.push(value);
        }
        *dependency_mandatory = true;
        *dependency_side = None;
        *dependency_version = None;
    };

    for raw_line in value.lines() {
        let line = raw_line.split('#').next().unwrap_or_default().trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with("[[dependencies.") || line.starts_with("[dependencies.") {
            flush_dependency(
                &mut dependency_id,
                &mut dependency_mandatory,
                &mut dependency_side,
                &mut dependency_version,
                &mut dependencies,
                &mut minecraft,
            );
            section = ForgeSection::Dependency;
            continue;
        }
        if line.starts_with("[[mods]]") || line.starts_with("[mods]") {
            flush_dependency(
                &mut dependency_id,
                &mut dependency_mandatory,
                &mut dependency_side,
                &mut dependency_version,
                &mut dependencies,
                &mut minecraft,
            );
            section = ForgeSection::Mods;
            continue;
        }
        if line.starts_with('[') {
            flush_dependency(
                &mut dependency_id,
                &mut dependency_mandatory,
                &mut dependency_side,
                &mut dependency_version,
                &mut dependencies,
                &mut minecraft,
            );
            section = ForgeSection::Other;
            continue;
        }
        let Some((key, raw_value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let parsed = toml_scalar(raw_value);
        match (section, key) {
            (ForgeSection::Mods, "modId") if id.is_none() => id = parsed,
            (ForgeSection::Dependency, "modId") => dependency_id = parsed,
            (ForgeSection::Dependency, "mandatory") => {
                dependency_mandatory = parsed
                    .as_deref()
                    .is_none_or(|value| value.eq_ignore_ascii_case("true"));
            }
            (ForgeSection::Dependency, "side") => dependency_side = parsed,
            (ForgeSection::Dependency, "versionRange") => dependency_version = parsed,
            _ => {}
        }
    }
    flush_dependency(
        &mut dependency_id,
        &mut dependency_mandatory,
        &mut dependency_side,
        &mut dependency_version,
        &mut dependencies,
        &mut minecraft,
    );

    Metadata {
        provided_ids: id.clone().into_iter().collect(),
        id,
        minecraft,
        loader: Some(loader.into()),
        dependencies: unique_ids(dependencies),
        client_required: false,
        client_only_marker: false,
    }
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

fn unique_ids(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| seen.insert(value.to_ascii_lowercase()))
        .collect()
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
    let mut value = String::new();
    entry.read_to_string(&mut value).ok()?;
    Some(value)
}

fn managed_files(root: &Path) -> AppResult<HashSet<String>> {
    let folder = root.join(".server-hub/extension-manifests");
    if !folder.is_dir() {
        return Ok(HashSet::new());
    }
    let mut values = HashSet::new();
    for entry in std::fs::read_dir(folder)?.flatten() {
        let Ok(bytes) = std::fs::read(entry.path()) else {
            continue;
        };
        let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
            continue;
        };
        if let Some(name) = value.get("fileName").and_then(|value| value.as_str()) {
            values.insert(name.to_ascii_lowercase());
        }
    }
    Ok(values)
}

fn expected_loader(profile: &ServerProfile, kind: &str) -> String {
    if kind == "plugin" {
        "paper".into()
    } else {
        profile.server_type.clone()
    }
}
fn version_value(value: &serde_json::Value) -> Option<String> {
    value.as_str().map(str::to_string).or_else(|| {
        value
            .as_array()
            .and_then(|items| items.first())
            .and_then(|value| value.as_str())
            .map(str::to_string)
    })
}
fn version_matches(requirement: &str, actual: &str) -> bool {
    requirement.contains(actual)
        || actual.starts_with(&format!("{requirement}."))
        || requirement == "*"
        || requirement.eq_ignore_ascii_case("any")
}
fn built_in_dependency(value: &str) -> bool {
    matches!(
        value.to_ascii_lowercase().as_str(),
        "minecraft"
            | "java"
            | "fabricloader"
            | "forge"
            | "neoforge"
            | "paper"
            | "bukkit"
            | "spigot"
    )
}
fn item(
    severity: &str,
    code: &str,
    title: &str,
    detail: String,
    files: Vec<String>,
    next_action: &str,
) -> ExtensionCheckItem {
    ExtensionCheckItem {
        severity: severity.into(),
        code: code.into(),
        title: title.into(),
        detail,
        files,
        next_action: next_action.into(),
    }
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};

    use super::*;
    use crate::models::{BasicSettings, ServerProfile};
    use zip::{ZipWriter, write::SimpleFileOptions};

    fn zip_with_entries(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        for (name, contents) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(contents).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn version_match_is_conservative() {
        assert!(version_matches(">=1.21.11", "1.21.11"));
        assert!(version_matches("1.21", "1.21.11"));
        assert!(!version_matches("1.20.1", "1.21.11"));
    }
    #[test]
    fn built_ins_are_not_reported_missing() {
        assert!(built_in_dependency("minecraft"));
        assert!(!built_in_dependency("cloth-config"));
    }

    #[test]
    fn forge_parser_ignores_optional_and_client_only_dependencies() {
        let metadata = parse_forge_metadata(
            r#"
[[mods]]
modId = "example"

[[dependencies.example]]
modId = "minecraft"
mandatory = true
versionRange = "[1.20.1]"
side = "BOTH"

[[dependencies.example]]
modId = "requiredmod"
mandatory = true
side = "BOTH"

[[dependencies.example]]
modId = "optionalmod"
mandatory = false
side = "BOTH"

[[dependencies.example]]
modId = "clientmod"
mandatory = true
side = "CLIENT"
"#,
            "forge",
        );

        assert_eq!(metadata.id.as_deref(), Some("example"));
        assert_eq!(metadata.minecraft.as_deref(), Some("[1.20.1]"));
        assert_eq!(metadata.dependencies, vec!["requiredmod"]);
    }

    #[test]
    fn nested_jarjar_mod_is_counted_as_provided() {
        let nested = zip_with_entries(&[(
            "META-INF/mods.toml",
            br#"
[[mods]]
modId = "puzzlesaccessapi"
"#,
        )]);
        let outer = zip_with_entries(&[
            (
                "META-INF/mods.toml",
                br#"
[[mods]]
modId = "puzzleslib"

[[dependencies.puzzleslib]]
modId = "puzzlesaccessapi"
mandatory = true
side = "BOTH"
"#,
            ),
            ("META-INF/jarjar/puzzlesaccessapi-forge.jar", &nested),
        ]);
        let mut archive = ZipArchive::new(Cursor::new(outer)).unwrap();
        let metadata = inspect_zip(&mut archive, "mod", 0);

        assert!(
            metadata
                .provided_ids
                .iter()
                .any(|value| value == "puzzleslib")
        );
        assert!(
            metadata
                .provided_ids
                .iter()
                .any(|value| value == "puzzlesaccessapi")
        );
        assert_eq!(metadata.dependencies, vec!["puzzlesaccessapi"]);
    }

    #[test]
    fn explicit_client_only_marker_blocks_forge_server_mod() {
        let root = std::env::temp_dir().join(format!(
            "msh-extension-client-only-test-{}",
            uuid::Uuid::new_v4()
        ));
        let mods = root.join("mods");
        std::fs::create_dir_all(&mods).unwrap();
        let archive = zip_with_entries(&[
            (
                "META-INF/mods.toml",
                br#"
[[mods]]
modId = "rpghud"
"#,
            ),
            (
                "example/ModRPGHud.class",
                b"client-side-only mod and should not be installed server-side",
            ),
        ]);
        std::fs::write(mods.join("RPG-HUD-3.13.jar"), archive).unwrap();
        let profile = ServerProfile {
            id: "server".into(),
            name: "Server".into(),
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
        };
        let report = check(&profile).unwrap();
        let finding = report
            .items
            .iter()
            .find(|item| item.code == "client-only-mod")
            .expect("explicit client-only marker should be reported");
        assert!(report.blocking);
        assert_eq!(finding.files, vec!["RPG-HUD-3.13.jar"]);
        assert!(finding.detail.contains("クライアント専用"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
