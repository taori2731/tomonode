use std::{
    cmp::Ordering,
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
    /// IDs declared by this archive's own metadata.  These are the only IDs
    /// that participate in top-level duplicate detection.
    top_level_ids: Vec<String>,
    /// IDs declared by archives contained in META-INF/jarjar/.  They are
    /// available for dependency resolution, but are not independent active
    /// files and therefore must not be counted as top-level duplicates.
    embedded_ids: Vec<String>,
    /// Flattened IDs retained for the existing inspection tests and internal
    /// compatibility.  New logic must use `top_level_ids` and `embedded_ids`
    /// so that provenance is not lost.
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
        let top_level_ids = if metadata.top_level_ids.is_empty() {
            metadata.id.clone().into_iter().collect::<Vec<_>>()
        } else {
            metadata.top_level_ids.clone()
        };
        for id in top_level_ids {
            let normalized = id.to_ascii_lowercase();
            present_ids.insert(normalized.clone());
            let files_for_id = ids.entry(normalized).or_default();
            if !files_for_id.iter().any(|value| value == &name) {
                files_for_id.push(name.clone());
            }
        }
        // A bundled library is still present for dependency resolution, but
        // it belongs to its parent artifact and is not another active mod
        // file.  This is what prevents four parents bundling mixinextras (or
        // two parents bundling geckolib) from producing false duplicates.
        for id in &metadata.embedded_ids {
            present_ids.insert(id.to_ascii_lowercase());
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
        metadata.embedded_ids.extend(nested_metadata.top_level_ids);
        metadata.embedded_ids.extend(nested_metadata.embedded_ids);
        metadata.dependencies.extend(nested_metadata.dependencies);
    }
    metadata.provided_ids = unique_ids(metadata.provided_ids);
    metadata.embedded_ids = unique_ids(metadata.embedded_ids);
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
            let top_level_ids = id.clone().into_iter().collect::<Vec<_>>();
            return Metadata {
                provided_ids: id.clone().into_iter().collect(),
                top_level_ids,
                embedded_ids: Vec::new(),
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
            let top_level_ids = id.clone().into_iter().collect::<Vec<_>>();
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
                top_level_ids,
                embedded_ids: Vec::new(),
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
    let mut top_level_ids = Vec::new();
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
            (ForgeSection::Mods, "modId") => {
                if let Some(value) = parsed {
                    if id.is_none() {
                        id = Some(value.clone());
                    }
                    top_level_ids.push(value);
                }
            }
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

    let top_level_ids = unique_ids(top_level_ids);
    Metadata {
        provided_ids: top_level_ids.clone(),
        top_level_ids,
        embedded_ids: Vec::new(),
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

#[derive(Clone, Debug, Eq, PartialEq)]
struct NumericVersion(Vec<u64>);

#[derive(Clone, Debug)]
struct VersionRange {
    lower: Option<NumericVersion>,
    lower_inclusive: bool,
    upper: Option<NumericVersion>,
    upper_inclusive: bool,
}

fn version_matches(requirement: &str, actual: &str) -> bool {
    let requirement = requirement.trim();
    if requirement == "*" || requirement.eq_ignore_ascii_case("any") {
        return true;
    }

    // Forge and NeoForge commonly use Maven's interval syntax.  Evaluate it
    // before the legacy string-compatible path so that a range such as
    // [1.20,1.21) does not accidentally become a substring match.
    if let Some(ranges) = parse_maven_ranges(requirement) {
        let Some(actual) = parse_numeric_version(actual) else {
            return false;
        };
        return ranges
            .iter()
            .any(|range| version_range_matches(range, &actual));
    }

    // Keep the existing comparator forms accepted by the checker.  They are
    // not Maven intervals, but some generated metadata and existing tests use
    // them (for example, >=1.21.11).
    let comparator = if let Some(value) = requirement.strip_prefix(">=") {
        Some((">=", value))
    } else if let Some(value) = requirement.strip_prefix("<=") {
        Some(("<=", value))
    } else if let Some(value) = requirement.strip_prefix('>') {
        Some((">", value))
    } else {
        requirement.strip_prefix('<').map(|value| ("<", value))
    };
    if let Some((operator, bound)) = comparator {
        let (Some(actual), Some(bound)) = (
            parse_numeric_version(actual),
            parse_numeric_version(bound.trim()),
        ) else {
            return false;
        };
        return match compare_numeric_versions(&actual, &bound) {
            Ordering::Less => matches!(operator, "<=" | "<"),
            Ordering::Equal => matches!(operator, ">=" | "<="),
            Ordering::Greater => matches!(operator, ">=" | ">"),
        };
    }

    // Fabric's simple dependency value is often a fixed version or a
    // major/minor prefix.  Preserve the old behavior where 1.20 matches
    // 1.20.1, while a plain fixed 1.20.1 does not match 1.20.10.
    requirement == actual
        || requirement.contains(actual)
        || actual.starts_with(&format!("{requirement}."))
}

fn parse_maven_ranges(requirement: &str) -> Option<Vec<VersionRange>> {
    let bytes = requirement.as_bytes();
    let mut cursor = 0;
    let mut ranges = Vec::new();

    while cursor < bytes.len() {
        while cursor < bytes.len() && (bytes[cursor].is_ascii_whitespace() || bytes[cursor] == b',')
        {
            cursor += 1;
        }
        if cursor >= bytes.len() {
            break;
        }

        let open = bytes[cursor] as char;
        if !matches!(open, '[' | '(') {
            return None;
        }
        let close_offset = requirement[cursor + 1..].find(|value| value == ']' || value == ')')?;
        let close = cursor + 1 + close_offset;
        let close_marker = bytes[close] as char;
        let body = &requirement[cursor + 1..close];

        let range = if let Some((lower, upper)) = body.split_once(',') {
            VersionRange {
                lower: parse_range_bound(lower)?,
                lower_inclusive: open == '[',
                upper: parse_range_bound(upper)?,
                upper_inclusive: close_marker == ']',
            }
        } else {
            // Maven's single-version form is an exact match, e.g.
            // [1.20.1]. Parentheses without a comma are not a valid exact
            // range and are left to the legacy compatibility path.
            if open != '[' || close_marker != ']' || body.trim().is_empty() {
                return None;
            }
            let version = parse_numeric_version(body.trim())?;
            VersionRange {
                lower: Some(version.clone()),
                lower_inclusive: true,
                upper: Some(version),
                upper_inclusive: true,
            }
        };
        ranges.push(range);
        cursor = close + 1;
    }

    (!ranges.is_empty()).then_some(ranges)
}

fn parse_range_bound(value: &str) -> Option<Option<NumericVersion>> {
    let value = value.trim();
    if value.is_empty() {
        Some(None)
    } else {
        parse_numeric_version(value).map(Some)
    }
}

fn parse_numeric_version(value: &str) -> Option<NumericVersion> {
    let core = value.trim().split(['-', '+']).next()?.trim();
    if core.is_empty() {
        return None;
    }
    let mut parts = Vec::new();
    for part in core.split('.') {
        if part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }
        parts.push(part.parse::<u64>().ok()?);
    }
    Some(NumericVersion(parts))
}

fn compare_numeric_versions(left: &NumericVersion, right: &NumericVersion) -> Ordering {
    let length = left.0.len().max(right.0.len());
    for index in 0..length {
        let left_part = left.0.get(index).copied().unwrap_or_default();
        let right_part = right.0.get(index).copied().unwrap_or_default();
        match left_part.cmp(&right_part) {
            Ordering::Equal => {}
            ordering => return ordering,
        }
    }
    Ordering::Equal
}

fn version_range_matches(range: &VersionRange, actual: &NumericVersion) -> bool {
    if let Some(lower) = &range.lower {
        match compare_numeric_versions(actual, lower) {
            Ordering::Less => return false,
            Ordering::Equal if !range.lower_inclusive => return false,
            Ordering::Equal | Ordering::Greater => {}
        }
    }
    if let Some(upper) = &range.upper {
        match compare_numeric_versions(actual, upper) {
            Ordering::Greater => return false,
            Ordering::Equal if !range.upper_inclusive => return false,
            Ordering::Equal | Ordering::Less => {}
        }
    }
    true
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

    fn forge_toml(
        ids: &[&str],
        dependency: Option<&str>,
        minecraft_version: Option<&str>,
    ) -> String {
        let mut value = String::new();
        for id in ids {
            value.push_str(&format!("[[mods]]\nmodId = \"{id}\"\n\n"));
        }
        if let Some(dependency) = dependency {
            let owner = ids.first().copied().unwrap_or("example");
            value.push_str(&format!(
                "[[dependencies.{owner}]]\nmodId = \"{dependency}\"\nmandatory = true\nside = \"BOTH\"\n\n"
            ));
        }
        if let Some(version) = minecraft_version {
            let owner = ids.first().copied().unwrap_or("example");
            value.push_str(&format!(
                "[[dependencies.{owner}]]\nmodId = \"minecraft\"\nmandatory = true\nversionRange = \"{version}\"\nside = \"BOTH\"\n\n"
            ));
        }
        value
    }

    fn forge_archive(
        ids: &[&str],
        embedded_ids: &[&str],
        dependency: Option<&str>,
        minecraft_version: Option<&str>,
    ) -> Vec<u8> {
        let metadata = forge_toml(ids, dependency, minecraft_version);
        let mut entries = vec![("META-INF/mods.toml", metadata.into_bytes())];
        let nested_archives = embedded_ids
            .iter()
            .map(|id| {
                let nested_metadata = forge_toml(&[id], None, None);
                let nested =
                    zip_with_entries(&[("META-INF/mods.toml", nested_metadata.as_bytes())]);
                let name = format!("META-INF/jarjar/{id}.jar");
                (name, nested)
            })
            .collect::<Vec<_>>();
        for (name, bytes) in &nested_archives {
            entries.push((name.as_str(), bytes.clone()));
        }
        let entry_refs = entries
            .iter()
            .map(|(name, bytes)| (*name, bytes.as_slice()))
            .collect::<Vec<_>>();
        zip_with_entries(&entry_refs)
    }

    fn test_profile(root: &Path) -> ServerProfile {
        ServerProfile {
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
        }
    }

    fn test_root(label: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("msh-extension-{label}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("mods")).unwrap();
        root
    }

    fn write_mod(root: &Path, name: &str, archive: Vec<u8>) {
        std::fs::write(root.join("mods").join(name), archive).unwrap();
    }

    #[test]
    fn version_match_is_conservative() {
        assert!(version_matches(">=1.21.11", "1.21.11"));
        assert!(version_matches("1.21", "1.21.11"));
        assert!(!version_matches("1.20.1", "1.21.11"));
    }

    #[test]
    fn forge_maven_ranges_honor_inclusive_and_exclusive_boundaries() {
        assert!(version_matches("[1.20,1.21)", "1.20"));
        assert!(version_matches("[1.20,1.21)", "1.20.1"));
        assert!(!version_matches("[1.20,1.21)", "1.21"));
        assert!(!version_matches("(1.20,1.21)", "1.20"));
        assert!(version_matches("(1.20,1.21)", "1.20.1"));
        assert!(!version_matches("(1.20,1.21)", "1.21"));
        assert!(version_matches("[1.20,1.21]", "1.21"));
    }

    #[test]
    fn forge_maven_open_ended_ranges_and_version_precision_work() {
        assert!(version_matches("[1.20,)", "1.20"));
        assert!(version_matches("[1.20,)", "1.20.1"));
        assert!(version_matches("[1.20,)", "1.21.4"));
        assert!(!version_matches("[1.20,)", "1.19.4"));
        assert!(!version_matches("[1.20,1.20.1)", "1.20.1"));
        assert!(version_matches("[1.20,1.20.1)", "1.20"));
        assert!(version_matches("[1.20.1]", "1.20.1"));
        assert!(!version_matches("[1.20.1]", "1.20"));
    }

    #[test]
    fn forge_maven_multiple_ranges_are_an_or_expression() {
        let requirement = "(,1.19],[1.20,1.21)";
        assert!(version_matches(requirement, "1.19"));
        assert!(!version_matches(requirement, "1.19.1"));
        assert!(version_matches(requirement, "1.20.1"));
        assert!(!version_matches(requirement, "1.21"));
    }

    #[test]
    fn check_does_not_report_a_forge_version_range_that_contains_server_version() {
        let root = test_root("minecraft-version-range-check");
        write_mod(
            &root,
            "versioned.jar",
            forge_archive(&["versioned"], &[], None, Some("[1.20,1.21)")),
        );

        let report = check(&test_profile(&root)).unwrap();
        assert!(!report.blocking);
        assert!(
            !report
                .items
                .iter()
                .any(|item| item.code == "minecraft-version")
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore = "requires MSH_EXTENSION_CHECK_SERVER_ROOT and only reads that server root"]
    fn read_only_acceptance_check_for_configured_server_root() {
        let root = PathBuf::from(
            std::env::var_os("MSH_EXTENSION_CHECK_SERVER_ROOT")
                .expect("MSH_EXTENSION_CHECK_SERVER_ROOT must point to a server root"),
        );
        assert!(
            root.is_dir(),
            "MSH_EXTENSION_CHECK_SERVER_ROOT is not a directory: {}",
            root.display()
        );

        let mut profile = test_profile(&root);
        profile.minecraft_version = std::env::var("MSH_EXTENSION_CHECK_MINECRAFT_VERSION")
            .unwrap_or_else(|_| "1.20.1".into());
        profile.server_type =
            std::env::var("MSH_EXTENSION_CHECK_SERVER_TYPE").unwrap_or_else(|_| "forge".into());

        // `check` only enumerates and reads the configured root.  It does not
        // start the server or mutate Mods, worlds, settings, backups, or DBs.
        let report = check(&profile).expect("read-only extension check should succeed");
        eprintln!(
            "MSH extension check result:\n{}",
            serde_json::to_string_pretty(&report).expect("report should serialize")
        );

        for finding in report
            .items
            .iter()
            .filter(|item| item.code == "duplicate-id")
        {
            assert_eq!(finding.severity, "error");
            assert!(
                finding.files.len() >= 2,
                "duplicate-id finding must list every conflicting file: {finding:?}"
            );
            assert!(
                finding.detail.contains("ID"),
                "duplicate-id finding must include the duplicated ID: {finding:?}"
            );
            eprintln!(
                "duplicate-id: {} ({})",
                finding.detail,
                finding.files.join(", ")
            );
        }
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
        assert_eq!(metadata.top_level_ids, vec!["puzzleslib"]);
        assert_eq!(metadata.embedded_ids, vec!["puzzlesaccessapi"]);
        assert_eq!(metadata.dependencies, vec!["puzzlesaccessapi"]);
    }

    #[test]
    fn common_embedded_libraries_are_not_top_level_duplicates() {
        let root = test_root("embedded-common-libraries");
        for index in 0..4 {
            let id = format!("mixin_parent_{index}");
            let archive = forge_archive(&[id.as_str()], &["mixinextras"], None, None);
            write_mod(&root, &format!("{id}.jar"), archive);
        }
        for index in 0..2 {
            let id = format!("gecko_parent_{index}");
            let archive = forge_archive(&[id.as_str()], &["geckolib"], None, None);
            write_mod(&root, &format!("{id}.jar"), archive);
        }

        let report = check(&test_profile(&root)).unwrap();
        assert!(
            !report.blocking,
            "embedded libraries must not block: {report:?}"
        );
        assert!(!report.items.iter().any(|item| item.code == "duplicate-id"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn top_level_and_embedded_same_id_are_not_duplicates() {
        let root = test_root("top-level-and-embedded");
        write_mod(
            &root,
            "geckolib.jar",
            forge_archive(&["geckolib"], &[], None, None),
        );
        write_mod(
            &root,
            "parent.jar",
            forge_archive(&["parent"], &["geckolib"], None, None),
        );

        let report = check(&test_profile(&root)).unwrap();
        assert!(!report.blocking);
        assert!(!report.items.iter().any(|item| item.code == "duplicate-id"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn duplicate_top_level_mod_ids_block() {
        let root = test_root("duplicate-top-level");
        write_mod(
            &root,
            "example-a.jar",
            forge_archive(&["example"], &[], None, None),
        );
        write_mod(
            &root,
            "example-b.jar",
            forge_archive(&["example"], &[], None, None),
        );

        let report = check(&test_profile(&root)).unwrap();
        assert!(report.blocking);
        let duplicate = report
            .items
            .iter()
            .find(|item| item.code == "duplicate-id")
            .expect("same top-level mod ID should be reported");
        assert_eq!(duplicate.files.len(), 2);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn bundled_embedded_dependency_satisfies_parent() {
        let root = test_root("bundled-dependency");
        write_mod(
            &root,
            "parent.jar",
            forge_archive(&["parent"], &["mixinextras"], Some("mixinextras"), None),
        );

        let report = check(&test_profile(&root)).unwrap();
        assert!(!report.blocking);
        assert!(
            !report
                .items
                .iter()
                .any(|item| item.code == "missing-dependency")
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn multiple_mods_in_one_jar_do_not_self_duplicate() {
        let root = test_root("multi-mod-jar");
        write_mod(
            &root,
            "multi.jar",
            forge_archive(&["first", "second"], &[], None, None),
        );

        let report = check(&test_profile(&root)).unwrap();
        assert!(!report.blocking);
        assert!(!report.items.iter().any(|item| item.code == "duplicate-id"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn minecraft_version_mismatch_is_a_warning_only() {
        let root = test_root("minecraft-version-warning");
        write_mod(
            &root,
            "versioned.jar",
            forge_archive(&["versioned"], &[], None, Some("[1.19.4]")),
        );

        let report = check(&test_profile(&root)).unwrap();
        assert!(!report.blocking);
        let finding = report
            .items
            .iter()
            .find(|item| item.code == "minecraft-version")
            .expect("version mismatch should remain visible");
        assert_eq!(finding.severity, "warning");
        std::fs::remove_dir_all(root).unwrap();
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
