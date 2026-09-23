//! M6 explicit, recoverable quarantine transactions for Java top-level Mods.
//!
//! The transaction is deliberately a sidecar beside the existing M2/M3
//! inventory.  It never deletes a JAR and it never mutates `.server-hub/disabled`.
//! All serialized paths are server-relative; host paths and backup archive
//! paths stay out of the journal and Tauri API.

use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Component, Path, PathBuf},
    sync::{LazyLock, Mutex, MutexGuard},
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    backup,
    error::{AppError, AppResult},
    extension_check, mod_management,
    models::ServerProfile,
};

pub const QUARANTINE_SCHEMA_VERSION: u32 = 1;
pub const APPLY_CONFIRMATION: &str = "隔離を実行";
pub const RESTORE_CONFIRMATION: &str = "復元を実行";

const MAX_OPERATION_BYTES: usize = 2 * 1024 * 1024;
const MAX_MANIFEST_BYTES: usize = 2 * 1024 * 1024;
const MAX_OPERATIONS: usize = 200;
const MAX_RELATIVE_PATH_CHARS: usize = 240;

#[cfg(test)]
thread_local! {
    static FAIL_ATOMIC_WRITE: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

// All lifecycle transitions and explicit mutations are serialized so a list
// or recovery reconciliation can never race an apply/restore operation.
static QUARANTINE_OPERATION_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

fn operation_lock() -> AppResult<MutexGuard<'static, ()>> {
    QUARANTINE_OPERATION_LOCK
        .lock()
        .map_err(|_| AppError::Other("Mod隔離操作の排他状態を回復できません".into()))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuarantineSelection {
    /// A top-level path relative to the server's `mods` folder (for example
    /// `example.jar`).  Absolute paths are intentionally not accepted.
    pub relative_path: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuarantineCandidate {
    pub relative_path: String,
    pub file_name: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub valid: bool,
    #[serde(default)]
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InventoryItem {
    pub relative_path: String,
    pub sha256: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuarantineItem {
    pub source_relative_path: String,
    pub quarantine_relative_path: String,
    pub file_name: String,
    pub sha256: String,
    #[serde(default)]
    pub moved: bool,
    #[serde(default)]
    pub restored: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct LaunchValidationReference {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attempt_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ready_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuarantineJournal {
    pub schema_version: u32,
    pub operation_id: String,
    pub server_id: String,
    pub status: String,
    pub stage: String,
    pub selected: Vec<QuarantineItem>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backup_id: Option<String>,
    pub planned_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inventory_before_fingerprint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inventory_after_fingerprint: Option<String>,
    #[serde(default)]
    pub launch_validation: LaunchValidationReference,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    pub recovery_guidance: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuarantineOverview {
    pub schema_version: u32,
    pub candidates: Vec<QuarantineCandidate>,
    pub operations: Vec<QuarantineJournal>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuarantineManifest {
    pub schema_version: u32,
    pub operation_id: String,
    pub created_at: String,
    pub items: Vec<QuarantineItem>,
    pub notice: String,
}

#[derive(Debug, Clone)]
pub struct LaunchValidationInput<'a> {
    pub attempt_id: &'a str,
    pub started_at: &'a str,
    pub ready_at: Option<&'a str>,
    pub failure_code: Option<&'a str>,
}

#[derive(Debug, Clone)]
struct Inventory {
    items: Vec<InventoryItem>,
    fingerprint: String,
}

pub fn operations_dir(profile: &ServerProfile) -> PathBuf {
    Path::new(&profile.root_path)
        .join(".server-hub")
        .join("mod-management")
        .join("operations")
}

fn quarantine_root(profile: &ServerProfile) -> PathBuf {
    Path::new(&profile.root_path)
        .join(".server-hub")
        .join("quarantine")
}

fn operation_path(profile: &ServerProfile, operation_id: &str) -> AppResult<PathBuf> {
    validate_id(operation_id)?;
    Ok(operations_dir(profile).join(format!("{operation_id}.json")))
}

fn operation_quarantine_dir(profile: &ServerProfile, operation_id: &str) -> AppResult<PathBuf> {
    validate_id(operation_id)?;
    Ok(quarantine_root(profile).join(operation_id))
}

pub fn list(profile: &ServerProfile) -> AppResult<QuarantineOverview> {
    let _operation = operation_lock()?;
    let candidates = list_candidates(profile)?;
    let directory = operations_dir(profile);
    reject_reparse_ancestors(&directory)?;
    let mut operations = Vec::new();
    match fs::symlink_metadata(&directory) {
        Ok(metadata) if is_reparse_or_symlink(&metadata) || !metadata.is_dir() => {
            return Err(AppError::Validation(
                "Mod隔離操作フォルダーが通常のフォルダーではありません".into(),
            ));
        }
        Ok(_) => {
            let mut entries = fs::read_dir(&directory)?.collect::<io::Result<Vec<_>>>()?;
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries {
                let path = entry.path();
                if path.extension().and_then(|value| value.to_str()) != Some("json") {
                    continue;
                }
                let mut operation = read_journal_for_profile(profile, &path)?;
                if is_recoverable_stage(&operation.status) {
                    reconcile_journal(profile, &mut operation)?;
                }
                operations.push(operation);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    operations.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    if operations.len() > MAX_OPERATIONS {
        // Never hide an open or recovery-needed transaction.  The cap only
        // limits terminal history in this API view; files remain on disk.
        let nonterminal = operations
            .iter()
            .filter(|operation| !is_terminal(&operation.status))
            .cloned()
            .collect::<Vec<_>>();
        let terminal_limit = MAX_OPERATIONS.saturating_sub(nonterminal.len());
        let mut terminal = operations
            .iter()
            .filter(|operation| is_terminal(&operation.status))
            .cloned()
            .collect::<Vec<_>>();
        terminal.truncate(terminal_limit);
        operations = nonterminal;
        operations.extend(terminal);
        operations.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    }
    Ok(QuarantineOverview {
        schema_version: QUARANTINE_SCHEMA_VERSION,
        candidates,
        operations,
    })
}

pub fn list_candidates(profile: &ServerProfile) -> AppResult<Vec<QuarantineCandidate>> {
    if profile.game_adapter().is_palworld() || profile.edition() != "java" {
        return Err(AppError::Validation(
            "Mod隔離候補はMinecraft Java Edition専用です".into(),
        ));
    }
    let mods = mods_dir(profile)?;
    if !mods.is_dir() {
        return Ok(Vec::new());
    }
    reject_reparse_ancestors(&mods)?;
    let mut entries = fs::read_dir(&mods)?.collect::<io::Result<Vec<_>>>()?;
    entries.sort_by_key(|entry| entry.file_name());
    let mut candidates = Vec::new();
    for entry in entries {
        let path = entry.path();
        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !file_name.to_ascii_lowercase().ends_with(".jar") {
            continue;
        }
        let mut reasons = Vec::new();
        let valid = validate_regular_mod_path(profile, file_name).is_ok();
        if !valid {
            reasons.push("regular-top-level-jarではありません".into());
        }
        let (sha256, size_bytes) = match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_file() && valid => match hash_file(&path) {
                Ok(hash) => (hash, metadata.len()),
                Err(_) => {
                    reasons.push("SHA-256を確認できません".into());
                    (String::new(), metadata.len())
                }
            },
            Ok(metadata) => (String::new(), metadata.len()),
            Err(_) => {
                reasons.push("ファイルを読み取れません".into());
                (String::new(), 0)
            }
        };
        candidates.push(QuarantineCandidate {
            relative_path: file_name.into(),
            file_name: file_name.into(),
            sha256,
            size_bytes,
            valid: reasons.is_empty(),
            reasons,
        });
    }
    Ok(candidates)
}

pub fn apply(
    profile: &ServerProfile,
    backups_root: &Path,
    selections: Vec<QuarantineSelection>,
    confirmation: &str,
) -> AppResult<QuarantineJournal> {
    apply_with_checkpoint(profile, backups_root, selections, confirmation, |_| Ok(()))
}

fn apply_with_checkpoint<F>(
    profile: &ServerProfile,
    backups_root: &Path,
    selections: Vec<QuarantineSelection>,
    confirmation: &str,
    mut checkpoint: F,
) -> AppResult<QuarantineJournal>
where
    F: FnMut(&str) -> AppResult<()>,
{
    let _operation = operation_lock()?;
    if confirmation != APPLY_CONFIRMATION {
        return Err(AppError::Validation(
            "Mod隔離の最終確認が一致しません。表示された確認文を確認してください".into(),
        ));
    }
    if profile.game_adapter().is_palworld() || profile.edition() != "java" {
        return Err(AppError::Validation(
            "Mod隔離はMinecraft Java Edition専用です".into(),
        ));
    }
    if selections.is_empty() {
        return Err(AppError::Validation(
            "隔離するModを1件以上選択してください".into(),
        ));
    }
    validate_server_id(&profile.id)?;
    if load_journals(profile)?
        .iter()
        .any(|operation| !is_terminal(&operation.status))
    {
        return Err(AppError::Validation(
            "未完了のMod隔離操作があります。履歴を確認し、復元または起動検証を完了してください"
                .into(),
        ));
    }
    let before = scan_inventory(profile)?;
    let selected = validate_selections(profile, selections, &before)?;
    let operation_id = Uuid::new_v4().to_string();
    let op_path = operation_path(profile, &operation_id)?;
    let qdir = operation_quarantine_dir(profile, &operation_id)?;
    let destination = qdir.join("mods");
    prepare_sidecar_directory(&operations_dir(profile))?;
    prepare_sidecar_directory(&quarantine_root(profile))?;
    reject_reparse_ancestors(&qdir)?;
    fs::create_dir(&qdir)?;
    reject_reparse_ancestors(&qdir)?;
    fs::create_dir(&destination)?;
    reject_reparse_ancestors(&destination)?;

    let now = Utc::now().to_rfc3339();
    let mut journal = QuarantineJournal {
        schema_version: QUARANTINE_SCHEMA_VERSION,
        operation_id: operation_id.clone(),
        server_id: profile.id.clone(),
        status: "planned".into(),
        stage: "planned".into(),
        selected,
        backup_id: None,
        planned_at: now.clone(),
        updated_at: now,
        inventory_before_fingerprint: Some(before.fingerprint.clone()),
        inventory_after_fingerprint: None,
        launch_validation: LaunchValidationReference::default(),
        last_error: None,
        recovery_guidance: recovery_guidance(),
    };
    write_journal(&op_path, &journal)?;
    checkpoint("planned")?;

    let backup = match backup::create(backups_root, profile, "before-mod-change") {
        Ok(backup) => backup,
        Err(error) => {
            mark_error(&op_path, &mut journal, "backup-failed", &error.to_string());
            return Err(error);
        }
    };
    journal.backup_id = Some(backup.id);
    journal.status = "backup-created".into();
    journal.stage = "backup-created".into();
    touch(&mut journal);
    write_journal(&op_path, &journal)?;
    checkpoint("backup-created")?;

    journal.status = "move-started".into();
    journal.stage = "move-started".into();
    touch(&mut journal);
    write_journal(&op_path, &journal)?;
    checkpoint("move-started")?;
    for index in 0..journal.selected.len() {
        let item = journal.selected[index].clone();
        let source = source_path(profile, &item.source_relative_path)?;
        let target = qdir.join(&item.quarantine_relative_path);
        if let Err(error) = validate_source_hash(&source, &item.sha256)
            .and_then(|_| ensure_destination_absent(&target))
            .and_then(|_| validate_move_parents(&source, &target).map_err(AppError::from))
            .and_then(|_| atomic_rename_same_volume(&source, &target).map_err(AppError::from))
        {
            mark_error(&op_path, &mut journal, "move-failed", &error.to_string());
            return Err(error);
        }
        journal.selected[index].moved = true;
        journal.selected[index].restored = false;
        journal.status = "one-file-moved".into();
        journal.stage = "one-file-moved".into();
        touch(&mut journal);
        if let Err(error) = write_journal(&op_path, &journal) {
            // The next list/open reconciles source/destination state.  Do not
            // attempt a compensating overwrite after a durable move.
            return Err(error);
        }
        checkpoint("one-file-moved")?;
    }

    let manifest = QuarantineManifest {
        schema_version: QUARANTINE_SCHEMA_VERSION,
        operation_id: operation_id.clone(),
        created_at: Utc::now().to_rfc3339(),
        items: journal.selected.clone(),
        notice: "このマニフェストは復元用の相対パスとSHA-256だけを含みます。自動削除・上書きは行いません。".into(),
    };
    if let Err(error) = write_manifest(&qdir.join("manifest.json"), &manifest) {
        mark_error(
            &op_path,
            &mut journal,
            "manifest-failed",
            &error.to_string(),
        );
        return Err(error);
    }
    journal.status = "quarantined".into();
    journal.stage = "quarantined".into();
    touch(&mut journal);
    write_journal(&op_path, &journal)?;
    checkpoint("quarantined")?;
    journal.status = "rechecking".into();
    journal.stage = "rechecking".into();
    touch(&mut journal);
    write_journal(&op_path, &journal)?;
    checkpoint("rechecking")?;

    let report =
        match mod_management::refresh(profile).and_then(|_| extension_check::check(profile)) {
            Ok(report) => report,
            Err(error) => {
                mark_error(&op_path, &mut journal, "recheck-failed", &error.to_string());
                return Err(error);
            }
        };
    if report.blocking {
        let error = AppError::Validation(
            "隔離後のMod再検査で起動を阻止する問題が残りました。復元を確認してください".into(),
        );
        mark_error(
            &op_path,
            &mut journal,
            "recheck-blocking",
            &error.to_string(),
        );
        return Err(error);
    }
    let after = match scan_inventory(profile) {
        Ok(inventory) => inventory,
        Err(error) => {
            mark_error(
                &op_path,
                &mut journal,
                "inventory-failed",
                &error.to_string(),
            );
            return Err(error);
        }
    };
    journal.inventory_after_fingerprint = Some(after.fingerprint);
    journal.status = "awaiting-launch-validation".into();
    journal.stage = "awaiting-launch-validation".into();
    touch(&mut journal);
    write_journal(&op_path, &journal)?;
    checkpoint("awaiting-launch-validation")?;
    Ok(journal)
}

pub fn restore(
    profile: &ServerProfile,
    operation_id: &str,
    confirmation: &str,
) -> AppResult<QuarantineJournal> {
    restore_with_checkpoint(profile, operation_id, confirmation, |_| Ok(()))
}

fn restore_with_checkpoint<F>(
    profile: &ServerProfile,
    operation_id: &str,
    confirmation: &str,
    mut checkpoint: F,
) -> AppResult<QuarantineJournal>
where
    F: FnMut(&str) -> AppResult<()>,
{
    let _operation = operation_lock()?;
    if confirmation != RESTORE_CONFIRMATION {
        return Err(AppError::Validation(
            "Mod復元の最終確認が一致しません。表示された確認文を確認してください".into(),
        ));
    }
    let path = operation_path(profile, operation_id)?;
    let mut journal = read_journal_for_profile(profile, &path)?;
    if journal.selected.is_empty() {
        return Err(AppError::Validation("復元対象がありません".into()));
    }
    // Preflight every item before moving any item.  A hash-matching source
    // left by an interrupted restore is already restored; a different source,
    // or both source and destination present, is a hard conflict.
    for item in &mut journal.selected {
        let source = source_path_for_restore(profile, &item.source_relative_path)?;
        let target =
            operation_quarantine_dir(profile, operation_id)?.join(&item.quarantine_relative_path);
        reject_reparse_ancestors(&target)?;
        let source_state = hash_if_regular(&source)?;
        let target_state = hash_if_regular(&target)?;
        match (source_state.as_deref(), target_state.as_deref()) {
            (Some(source_hash), None) if source_hash.eq_ignore_ascii_case(&item.sha256) => {
                item.moved = false;
                item.restored = true;
            }
            (Some(_), Some(_)) => {
                return Err(AppError::Validation(format!(
                    "復元先と隔離先の両方に同名ファイルがあるため上書きしません: {}",
                    item.source_relative_path
                )));
            }
            (Some(_), None) => {
                return Err(AppError::Validation(format!(
                    "復元先に別内容の同名ファイルがあるため上書きしません: {}",
                    item.source_relative_path
                )));
            }
            (None, Some(target_hash)) if target_hash.eq_ignore_ascii_case(&item.sha256) => {}
            (None, None) => {
                return Err(AppError::Validation(format!(
                    "復元元と隔離先のどちらにもファイルがありません: {}",
                    item.source_relative_path
                )));
            }
            _ => {
                return Err(AppError::Validation(format!(
                    "隔離先のSHA-256が変わったため復元しません: {}",
                    item.source_relative_path
                )));
            }
        }
    }
    journal.status = "restoring".into();
    journal.stage = "restoring".into();
    journal.last_error = None;
    touch(&mut journal);
    write_journal(&path, &journal)?;
    if let Err(error) = ensure_mods_directory(profile) {
        mark_error(
            &path,
            &mut journal,
            "restore-folder-failed",
            &error.to_string(),
        );
        return Err(error);
    }
    for index in 0..journal.selected.len() {
        let item = journal.selected[index].clone();
        let source = source_path_for_restore(profile, &item.source_relative_path)?;
        let target =
            operation_quarantine_dir(profile, operation_id)?.join(&item.quarantine_relative_path);
        reject_reparse_ancestors(&target)?;
        if journal.selected[index].restored && !target.exists() {
            continue;
        }
        if let Err(error) = ensure_destination_absent(&source)
            .and_then(|_| validate_source_hash(&target, &item.sha256))
            .and_then(|_| validate_move_parents(&target, &source).map_err(AppError::from))
            .and_then(|_| atomic_rename_same_volume(&target, &source).map_err(AppError::from))
        {
            mark_error(&path, &mut journal, "restore-failed", &error.to_string());
            return Err(error);
        }
        journal.selected[index].moved = false;
        journal.selected[index].restored = true;
        journal.stage = "one-file-restored".into();
        touch(&mut journal);
        if let Err(error) = write_journal(&path, &journal) {
            return Err(error);
        }
        checkpoint("one-file-restored")?;
    }
    let after = match mod_management::refresh(profile)
        .and_then(|_| extension_check::check(profile))
        .and_then(|report| {
            if report.blocking {
                Err(AppError::Validation(
                    "復元後のMod再検査で起動を阻止する問題が残りました".into(),
                ))
            } else {
                scan_inventory(profile)
            }
        }) {
        Ok(inventory) => inventory,
        Err(error) => {
            mark_error(
                &path,
                &mut journal,
                "restore-recheck-failed",
                &error.to_string(),
            );
            return Err(error);
        }
    };
    journal.inventory_after_fingerprint = Some(after.fingerprint);
    journal.status = "restored".into();
    journal.stage = "restored".into();
    journal.launch_validation.outcome = Some("restored".into());
    touch(&mut journal);
    write_journal(&path, &journal)?;
    checkpoint("restored")?;
    Ok(journal)
}

/// Bind the next matching launch attempt to one pending operation.  This is
/// called only when M5 creates a Java attempt, never for ordinary log lines.
pub fn bind_launch_attempt(
    profile: &ServerProfile,
    attempt_id: &str,
    started_at: &str,
    target: &mod_management::ModManagementTarget,
) -> AppResult<()> {
    let _operation = operation_lock()?;
    let directory = operations_dir(profile);
    if !directory.is_dir() {
        return Ok(());
    }
    let mut operations = load_journals(profile)?;
    for operation in &mut operations {
        if operation.status != "awaiting-launch-validation"
            || operation.launch_validation.attempt_id.is_some()
            || operation.planned_at.as_str() > started_at
            || !target_matches_profile(target, profile)
        {
            continue;
        }
        operation.launch_validation.attempt_id = Some(attempt_id.to_string());
        operation.launch_validation.started_at = Some(started_at.to_string());
        touch(operation);
        write_journal(
            &operation_path(profile, &operation.operation_id)?,
            operation,
        )?;
        break;
    }
    Ok(())
}

/// Commit exactly the operation bound to this fresh Ready attempt.  A Ready
/// attempt from before the operation, or an unrelated attempt ID, is ignored.
pub fn on_launch_ready(profile: &ServerProfile, input: LaunchValidationInput<'_>) -> AppResult<()> {
    let _operation = operation_lock()?;
    let mut operations = load_journals(profile)?;
    for operation in &mut operations {
        if operation.status != "awaiting-launch-validation"
            || operation.launch_validation.attempt_id.as_deref() != Some(input.attempt_id)
            || operation.launch_validation.started_at.as_deref() != Some(input.started_at)
        {
            continue;
        }
        operation.status = "committed".into();
        operation.stage = "committed".into();
        operation.launch_validation.ready_at = input.ready_at.map(str::to_string);
        operation.launch_validation.outcome = Some("ready".into());
        touch(operation);
        write_journal(
            &operation_path(profile, &operation.operation_id)?,
            operation,
        )?;
        break;
    }
    Ok(())
}

/// A fatal loader result or exit-before-ready changes the pending operation
/// into explicit recovery-needed state.  No restore is attempted implicitly.
pub fn on_launch_failure(
    profile: &ServerProfile,
    input: LaunchValidationInput<'_>,
) -> AppResult<()> {
    let _operation = operation_lock()?;
    let mut operations = load_journals(profile)?;
    for operation in &mut operations {
        if operation.status != "awaiting-launch-validation"
            || operation.launch_validation.attempt_id.as_deref() != Some(input.attempt_id)
            || operation.launch_validation.started_at.as_deref() != Some(input.started_at)
        {
            continue;
        }
        operation.status = "needs-recovery".into();
        operation.stage = "validation-failed".into();
        operation.launch_validation.outcome = Some("validation-failed".into());
        operation.launch_validation.failure_code = input.failure_code.map(str::to_string);
        operation.last_error = operation.launch_validation.failure_code.clone();
        touch(operation);
        write_journal(
            &operation_path(profile, &operation.operation_id)?,
            operation,
        )?;
        break;
    }
    Ok(())
}

fn load_journals(profile: &ServerProfile) -> AppResult<Vec<QuarantineJournal>> {
    let directory = operations_dir(profile);
    reject_reparse_ancestors(&directory)?;
    let metadata = match fs::symlink_metadata(&directory) {
        Ok(metadata) if !is_reparse_or_symlink(&metadata) && metadata.is_dir() => metadata,
        Ok(_) => {
            return Err(AppError::Validation(
                "Mod隔離操作フォルダーが通常のフォルダーではありません".into(),
            ));
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let _ = metadata;
    let mut entries = fs::read_dir(&directory)?.collect::<io::Result<Vec<_>>>()?;
    entries.sort_by_key(|entry| entry.file_name());
    let mut journals = Vec::new();
    for entry in entries {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        journals.push(read_journal_for_profile(profile, &path)?);
    }
    Ok(journals)
}

fn is_terminal(status: &str) -> bool {
    matches!(status, "committed" | "restored")
}

fn is_recoverable_stage(status: &str) -> bool {
    matches!(
        status,
        "planned"
            | "backup-created"
            | "move-started"
            | "one-file-moved"
            | "quarantined"
            | "rechecking"
            | "restoring"
            | "one-file-restored"
    )
}

fn reconcile_journal(profile: &ServerProfile, journal: &mut QuarantineJournal) -> AppResult<()> {
    let mut conflict = None;
    for item in &mut journal.selected {
        let source = source_path_for_restore(profile, &item.source_relative_path)?;
        let target = operation_quarantine_dir(profile, &journal.operation_id)?
            .join(&item.quarantine_relative_path);
        reject_reparse_ancestors(&target)?;
        let source_state = hash_if_regular(&source)?;
        let target_state = hash_if_regular(&target)?;
        match (source_state.as_deref(), target_state.as_deref()) {
            (Some(source_hash), None) if source_hash.eq_ignore_ascii_case(&item.sha256) => {
                item.moved = false;
                if journal.status == "restoring" {
                    item.restored = true;
                }
            }
            (None, Some(target_hash)) if target_hash.eq_ignore_ascii_case(&item.sha256) => {
                item.moved = true;
                item.restored = false;
            }
            (Some(_), Some(_)) => {
                conflict = Some("元パスと隔離先の両方にファイルがあります".into())
            }
            (None, None) => {
                conflict = Some("元パスと隔離先のどちらにもファイルがありません".into())
            }
            _ => conflict = Some("元パスまたは隔離先のSHA-256が変わっています".into()),
        }
    }
    if let Some(error) = conflict {
        journal.status = "needs-recovery".into();
        journal.stage = "reconcile-conflict".into();
        journal.last_error = Some(error);
    } else if journal.selected.iter().all(|item| item.moved) {
        journal.status = "needs-recovery".into();
        journal.stage = "reconciled-awaiting-review".into();
        journal
            .last_error
            .get_or_insert_with(|| "再オープン時に未完了の隔離段階を検出しました".into());
    } else {
        journal.status = "needs-recovery".into();
        journal.stage = "reconciled-partial".into();
        journal
            .last_error
            .get_or_insert_with(|| "再オープン時に隔離が完了していません".into());
    }
    touch(journal);
    write_journal(&operation_path(profile, &journal.operation_id)?, journal)
}

fn validate_selections(
    profile: &ServerProfile,
    selections: Vec<QuarantineSelection>,
    inventory: &Inventory,
) -> AppResult<Vec<QuarantineItem>> {
    let mut paths = HashSet::new();
    let mut result = Vec::with_capacity(selections.len());
    for selection in selections {
        let relative = validate_relative_path(&selection.relative_path)?;
        let key = selection_path_identity(&relative);
        if !paths.insert(key) {
            return Err(AppError::Validation(
                "同じModを重複して選択しています".into(),
            ));
        }
        let source = source_path(profile, &relative)?;
        validate_regular_mod_path(profile, &relative)?;
        let expected = normalize_hash(&selection.sha256).ok_or_else(|| {
            AppError::Validation(format!("{}のSHA-256が正しくありません", relative))
        })?;
        validate_source_hash(&source, &expected)?;
        if !inventory.items.iter().any(|item| {
            item.relative_path == relative && item.sha256.eq_ignore_ascii_case(&expected)
        }) {
            return Err(AppError::Validation(format!(
                "{}は現在のModインベントリと一致しません",
                relative
            )));
        }
        let file_name = Path::new(&relative)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(&relative)
            .to_string();
        result.push(QuarantineItem {
            source_relative_path: relative.clone(),
            quarantine_relative_path: format!("mods/{file_name}"),
            file_name,
            sha256: expected,
            moved: false,
            restored: false,
        });
    }
    Ok(result)
}

fn selection_path_identity(relative: &str) -> String {
    #[cfg(windows)]
    {
        relative.to_ascii_lowercase()
    }
    #[cfg(not(windows))]
    {
        relative.to_string()
    }
}

fn mods_dir(profile: &ServerProfile) -> AppResult<PathBuf> {
    let root = Path::new(&profile.root_path).canonicalize()?;
    if !root.is_dir() {
        return Err(AppError::Validation(
            "サーバーフォルダーが見つかりません".into(),
        ));
    }
    let mods = root.join("mods");
    reject_reparse_if_present(&mods)?;
    match fs::symlink_metadata(&mods) {
        Ok(metadata) if !metadata.is_dir() => {
            return Err(AppError::Validation(
                "modsパスが通常のフォルダーではありません".into(),
            ));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    Ok(mods)
}

fn ensure_mods_directory(profile: &ServerProfile) -> AppResult<()> {
    let mods = mods_dir(profile)?;
    match fs::symlink_metadata(&mods) {
        Ok(metadata) if !metadata.is_dir() || is_reparse_or_symlink(&metadata) => {
            return Err(AppError::Validation(
                "modsパスが通常のフォルダーではありません".into(),
            ));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => fs::create_dir(&mods)?,
        Err(error) => return Err(error.into()),
    }
    reject_reparse_ancestors(&mods)?;
    Ok(())
}

fn source_path(profile: &ServerProfile, relative: &str) -> AppResult<PathBuf> {
    let mods = mods_dir(profile)?;
    let relative = validate_relative_path(relative)?;
    let source = mods.join(&relative);
    let canonical = source.canonicalize()?;
    if canonical.parent() != Some(mods.as_path())
        || canonical.file_name() != Path::new(&relative).file_name()
    {
        return Err(AppError::Validation(
            "Modパスがcanonicalなmodsフォルダー外です".into(),
        ));
    }
    Ok(source)
}

/// Resolve an intended active path without requiring the file to exist. This
/// is used by explicit restore and crash reconciliation; callers still verify
/// metadata and SHA-256 before moving anything.
fn source_path_for_restore(profile: &ServerProfile, relative: &str) -> AppResult<PathBuf> {
    let mods = mods_dir(profile)?;
    let relative = validate_relative_path(relative)?;
    let source = mods.join(relative);
    if source.parent() != Some(mods.as_path()) {
        return Err(AppError::Validation(
            "Modの復元先がmods直下ではありません".into(),
        ));
    }
    Ok(source)
}

fn validate_regular_mod_path(profile: &ServerProfile, relative: &str) -> AppResult<()> {
    let source = source_path(profile, relative)?;
    let metadata = fs::symlink_metadata(&source)?;
    if is_reparse_or_symlink(&metadata) || !metadata.is_file() {
        return Err(AppError::Validation(
            "選択したModは通常ファイルではありません".into(),
        ));
    }
    if !source
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("jar"))
    {
        return Err(AppError::Validation(
            "隔離対象はJARだけに限定されます".into(),
        ));
    }
    ensure_not_hardlinked(&source)?;
    Ok(())
}

fn scan_inventory(profile: &ServerProfile) -> AppResult<Inventory> {
    let mods = mods_dir(profile)?;
    let mut items = Vec::new();
    if mods.is_dir() {
        let mut entries = fs::read_dir(mods)?.collect::<io::Result<Vec<_>>>()?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let path = entry.path();
            let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
                continue;
            };
            if !file_name.to_ascii_lowercase().ends_with(".jar") {
                continue;
            }
            validate_regular_mod_path(profile, file_name)?;
            let metadata = fs::symlink_metadata(&path)?;
            items.push(InventoryItem {
                relative_path: file_name.into(),
                sha256: hash_file(&path)?,
                size_bytes: metadata.len(),
            });
        }
    }
    let bytes = serde_json::to_vec(&items)?;
    let mut digest = Sha256::new();
    digest.update(bytes);
    Ok(Inventory {
        items,
        fingerprint: format!("sha256:{}", hex::encode(digest.finalize())),
    })
}

fn hash_if_regular(path: &Path) -> AppResult<Option<String>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if is_reparse_or_symlink(&metadata) => Err(AppError::Validation(
            "Mod隔離パスにシンボリックリンク／再解析ポイントがあります".into(),
        )),
        Ok(metadata) if metadata.is_file() => {
            ensure_not_hardlinked(path)?;
            Ok(Some(hash_file(path)?))
        }
        Ok(_) => Err(AppError::Validation(
            "Mod隔離パスが通常ファイルではありません".into(),
        )),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn validate_source_hash(path: &Path, expected: &str) -> AppResult<()> {
    let metadata = fs::symlink_metadata(path)?;
    if is_reparse_or_symlink(&metadata) || !metadata.is_file() {
        return Err(AppError::Validation(
            "Modが通常ファイルではありません".into(),
        ));
    }
    ensure_not_hardlinked(path)?;
    let actual = hash_file(path)?;
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(AppError::Validation(
            "ModのSHA-256が変わったため処理を中止しました".into(),
        ));
    }
    Ok(())
}

fn ensure_destination_absent(path: &Path) -> AppResult<()> {
    reject_reparse_if_present(path)?;
    if path.exists() {
        return Err(AppError::Validation(
            "隔離先または復元先に同名ファイルがあります。上書きしません".into(),
        ));
    }
    Ok(())
}

fn validate_relative_path(value: &str) -> AppResult<String> {
    let value = value.to_string();
    if value.is_empty()
        || value.chars().count() > MAX_RELATIVE_PATH_CHARS
        || value.contains('\0')
        || value.contains(':')
    {
        return Err(AppError::Validation(
            "Modの相対パスが正しくありません".into(),
        ));
    }
    #[cfg(windows)]
    if value.ends_with([' ', '.']) {
        return Err(AppError::Validation(
            "末尾が空白またはピリオドのMod名はWindowsの別名解決を避けるため操作できません".into(),
        ));
    }
    let path = Path::new(&value);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
        || path.components().count() != 1
    {
        return Err(AppError::Validation(
            "Modはmods直下のJARだけを選択できます".into(),
        ));
    }
    Ok(value)
}

fn normalize_hash(value: &str) -> Option<String> {
    let value = value.trim().strip_prefix("sha256:").unwrap_or(value.trim());
    (value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .then(|| value.to_ascii_lowercase())
}

fn hash_file(path: &Path) -> io::Result<String> {
    let mut file = open_regular_file(path)?;
    let metadata = file.metadata()?;
    if is_reparse_or_symlink(&metadata) || !metadata.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "expected a regular non-reparse file",
        ));
    }
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(hex::encode(digest.finalize()))
}

fn open_regular_file(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
        options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    }
    #[cfg(any(target_os = "linux", target_os = "android"))]
    {
        use std::os::unix::fs::OpenOptionsExt;
        const O_NOFOLLOW: i32 = 0x0002_0000;
        options.custom_flags(O_NOFOLLOW);
    }
    #[cfg(any(
        target_os = "macos",
        target_os = "ios",
        target_os = "freebsd",
        target_os = "openbsd",
        target_os = "netbsd"
    ))]
    {
        use std::os::unix::fs::OpenOptionsExt;
        const O_NOFOLLOW: i32 = 0x0000_0100;
        options.custom_flags(O_NOFOLLOW);
    }
    options.open(path)
}

fn ensure_not_hardlinked(path: &Path) -> AppResult<()> {
    let file = open_regular_file(path)?;
    let metadata = file.metadata()?;
    if is_reparse_or_symlink(&metadata) || !metadata.is_file() {
        return Err(AppError::Validation(
            "Modは通常ファイルではありません".into(),
        ));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.nlink() > 1 {
            return Err(AppError::Validation(
                "ハードリンクの可能性があるModは安全のため操作できません".into(),
            ));
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows::Win32::{
            Foundation::HANDLE,
            Storage::FileSystem::{BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle},
        };
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        unsafe {
            GetFileInformationByHandle(HANDLE(file.as_raw_handle()), &mut info)
                .map_err(|error| AppError::Other(error.to_string()))?;
        }
        if info.nNumberOfLinks > 1 {
            return Err(AppError::Validation(
                "ハードリンクの可能性があるModは安全のため操作できません".into(),
            ));
        }
    }
    Ok(())
}

fn write_journal(path: &Path, journal: &QuarantineJournal) -> AppResult<()> {
    atomic_json_write(path, journal, MAX_OPERATION_BYTES)
}

fn read_journal(path: &Path) -> AppResult<QuarantineJournal> {
    reject_reparse_ancestors(path)?;
    reject_reparse_if_present(path)?;
    let metadata = fs::symlink_metadata(path)?;
    if is_reparse_or_symlink(&metadata) || !metadata.is_file() {
        return Err(AppError::Validation(
            "Mod隔離操作ジャーナルが通常ファイルではありません".into(),
        ));
    }
    let file = open_regular_file(path)?;
    let handle_metadata = file.metadata()?;
    if is_reparse_or_symlink(&handle_metadata) || !handle_metadata.is_file() {
        return Err(AppError::Validation(
            "Mod隔離操作ジャーナルを安全に開けません".into(),
        ));
    }
    let mut bytes = Vec::with_capacity(metadata.len().min(MAX_OPERATION_BYTES as u64) as usize);
    file.take((MAX_OPERATION_BYTES + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_OPERATION_BYTES {
        return Err(AppError::Validation(
            "Mod隔離操作ジャーナルが大きすぎます".into(),
        ));
    }
    let journal: QuarantineJournal = serde_json::from_slice(&bytes)?;
    if journal.schema_version != QUARANTINE_SCHEMA_VERSION {
        return Err(AppError::Validation(
            "未対応のMod隔離操作schemaVersionです".into(),
        ));
    }
    validate_id(&journal.operation_id)?;
    validate_server_id(&journal.server_id)?;
    let file_stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::Validation("Mod隔離操作ファイル名が正しくありません".into()))?;
    if file_stem != journal.operation_id {
        return Err(AppError::Validation(
            "Mod隔離操作IDとジャーナルのファイル名が一致しません".into(),
        ));
    }
    if path.extension().and_then(|value| value.to_str()) != Some("json") {
        return Err(AppError::Validation(
            "Mod隔離操作ファイルの拡張子が正しくありません".into(),
        ));
    }
    if journal.selected.len() > 128
        || !matches!(
            journal.status.as_str(),
            "planned"
                | "backup-created"
                | "move-started"
                | "one-file-moved"
                | "quarantined"
                | "rechecking"
                | "awaiting-launch-validation"
                | "restoring"
                | "one-file-restored"
                | "needs-recovery"
                | "committed"
                | "restored"
        )
        || journal.stage.is_empty()
        || journal.stage.chars().count() > 96
        || journal.stage.chars().any(char::is_control)
    {
        return Err(AppError::Validation(
            "Mod隔離操作ジャーナルが正しくありません".into(),
        ));
    }
    let mut paths = HashSet::new();
    for item in &journal.selected {
        let relative = validate_relative_path(&item.source_relative_path)?;
        let key = relative.to_ascii_lowercase();
        let expected_name = Path::new(&relative)
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| {
                AppError::Validation("隔離ジャーナルのMod名が正しくありません".into())
            })?;
        let normalized_hash = normalize_hash(&item.sha256);
        if !paths.insert(key)
            || item.file_name != expected_name
            || item.quarantine_relative_path != format!("mods/{expected_name}")
            || normalized_hash
                .as_deref()
                .is_none_or(|normalized| !normalized.eq_ignore_ascii_case(&item.sha256))
        {
            return Err(AppError::Validation(
                "Mod隔離操作ジャーナルの対象パスまたはSHA-256が正しくありません".into(),
            ));
        }
    }
    Ok(journal)
}

fn read_journal_for_profile(profile: &ServerProfile, path: &Path) -> AppResult<QuarantineJournal> {
    validate_server_id(&profile.id)?;
    let journal = read_journal(path)?;
    if journal.server_id != profile.id {
        return Err(AppError::Validation(
            "Mod隔離ジャーナルが現在のサーバーIDと一致しません".into(),
        ));
    }
    Ok(journal)
}

fn validate_server_id(value: &str) -> AppResult<()> {
    if value.is_empty()
        || value.len() > 80
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(AppError::Validation(
            "Mod隔離ジャーナルのサーバーIDが正しくありません".into(),
        ));
    }
    Ok(())
}

fn write_manifest(path: &Path, manifest: &QuarantineManifest) -> AppResult<()> {
    atomic_json_write(path, manifest, MAX_MANIFEST_BYTES)
}

fn atomic_json_write<T: Serialize>(path: &Path, value: &T, max_bytes: usize) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::Validation("Mod隔離の保存先が正しくありません".into()))?;
    prepare_sidecar_directory(parent)?;
    reject_reparse_if_present(path)?;
    let bytes = serde_json::to_vec_pretty(value)?;
    if bytes.len() > max_bytes {
        return Err(AppError::Validation(
            "Mod隔離の保存データが上限を超えています".into(),
        ));
    }
    let temporary = parent.join(format!(
        ".{}.tmp-{}",
        path.file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("journal"),
        Uuid::new_v4()
    ));
    let result = (|| -> AppResult<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        #[cfg(test)]
        if FAIL_ATOMIC_WRITE.with(std::cell::Cell::get) {
            return Err(AppError::Other(
                "テスト用のMod隔離ジャーナル書き込み失敗".into(),
            ));
        }
        atomic_replace(&temporary, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn atomic_rename_same_volume(source: &Path, destination: &Path) -> io::Result<()> {
    validate_move_parents(source, destination)?;
    rename_without_replace(source, destination)
}

fn validate_move_parents(source: &Path, destination: &Path) -> io::Result<()> {
    reject_reparse_ancestors(source).map_err(|error| io::Error::other(error.to_string()))?;
    reject_reparse_ancestors(
        destination.parent().ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidInput, "destination has no parent")
        })?,
    )
    .map_err(|error| io::Error::other(error.to_string()))?;
    let source_parent = source
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "source has no parent"))?;
    let destination_parent = destination
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "destination has no parent"))?;
    for parent in [source_parent, destination_parent] {
        let metadata = fs::symlink_metadata(parent)?;
        if is_reparse_or_symlink(&metadata) || !metadata.is_dir() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "move parent is not a regular directory",
            ));
        }
    }
    match fs::symlink_metadata(destination) {
        Ok(_) => Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "destination exists",
        )),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(windows)]
fn rename_without_replace(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows::{
        Win32::Storage::FileSystem::{MOVE_FILE_FLAGS, MoveFileExW},
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
    // Flags 0 keeps this a same-volume rename and, critically, does not enable
    // MOVEFILE_REPLACE_EXISTING. MOVEFILE_WRITE_THROUGH is not supported by
    // every filesystem hosting a user-selected server folder, so durability is
    // provided by the journal/backup writes rather than making the move fail.
    unsafe {
        MoveFileExW(
            PCWSTR(source.as_ptr()),
            PCWSTR(destination.as_ptr()),
            MOVE_FILE_FLAGS(0),
        )
    }
    .map_err(|error| io::Error::other(error.to_string()))
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn rename_without_replace(source: &Path, destination: &Path) -> io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let source = CString::new(source.as_os_str().as_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "source path contains NUL"))?;
    let destination = CString::new(destination.as_os_str().as_bytes()).map_err(|_| {
        io::Error::new(io::ErrorKind::InvalidInput, "destination path contains NUL")
    })?;
    unsafe extern "C" {
        fn renameat2(
            old_dirfd: i32,
            old_path: *const std::ffi::c_char,
            new_dirfd: i32,
            new_path: *const std::ffi::c_char,
            flags: u32,
        ) -> i32;
    }
    let result = unsafe { renameat2(-100, source.as_ptr(), -100, destination.as_ptr(), 1) };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(target_os = "macos")]
fn rename_without_replace(source: &Path, destination: &Path) -> io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let source = CString::new(source.as_os_str().as_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "source path contains NUL"))?;
    let destination = CString::new(destination.as_os_str().as_bytes()).map_err(|_| {
        io::Error::new(io::ErrorKind::InvalidInput, "destination path contains NUL")
    })?;
    unsafe extern "C" {
        fn renamex_np(
            old_path: *const std::ffi::c_char,
            new_path: *const std::ffi::c_char,
            flags: u32,
        ) -> i32;
    }
    let result = unsafe { renamex_np(source.as_ptr(), destination.as_ptr(), 0x0000_0004) };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(not(any(
    windows,
    target_os = "linux",
    target_os = "android",
    target_os = "macos"
)))]
fn rename_without_replace(_source: &Path, _destination: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "atomic no-replace file moves are unsupported on this platform",
    ))
}

fn atomic_replace(source: &Path, destination: &Path) -> io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::{
            Win32::Storage::FileSystem::{MOVEFILE_REPLACE_EXISTING, MoveFileExW},
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
        unsafe {
            MoveFileExW(
                PCWSTR(source.as_ptr()),
                PCWSTR(destination.as_ptr()),
                MOVEFILE_REPLACE_EXISTING,
            )
        }
        .map_err(|error| io::Error::other(error.to_string()))
    }
    #[cfg(not(windows))]
    {
        fs::rename(source, destination)
    }
}

fn prepare_sidecar_directory(path: &Path) -> AppResult<()> {
    reject_reparse_ancestors(path)?;
    fs::create_dir_all(path)?;
    reject_reparse_ancestors(path)?;
    reject_reparse_if_present(path)
}

fn reject_reparse_ancestors(path: &Path) -> AppResult<()> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component.as_os_str());
        // On Windows, a verbatim path starts with a Prefix component such as
        // `\\?\C:`. That prefix alone is not a filesystem path and querying
        // its attributes can return ERROR_INVALID_FUNCTION. Check the volume
        // root and every real ancestor after the RootDir component instead.
        #[cfg(windows)]
        if matches!(component, Component::Prefix(_)) {
            continue;
        }
        reject_reparse_if_present(&current)?;
    }
    Ok(())
}

fn reject_reparse_if_present(path: &Path) -> AppResult<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if is_reparse_or_symlink(&metadata) => Err(AppError::Validation(format!(
            "Mod隔離パスにシンボリックリンク／再解析ポイントは使用できません: {}",
            path.display()
        ))),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn is_reparse_or_symlink(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn validate_id(value: &str) -> AppResult<()> {
    if value.is_empty()
        || value.len() > 80
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(AppError::Validation(
            "Mod隔離操作IDが正しくありません".into(),
        ));
    }
    Ok(())
}

fn touch(journal: &mut QuarantineJournal) {
    journal.updated_at = Utc::now().to_rfc3339();
}

fn mark_error(path: &Path, journal: &mut QuarantineJournal, stage: &str, error: &str) {
    journal.status = "needs-recovery".into();
    journal.stage = stage.into();
    journal.last_error = Some(error.chars().take(400).collect());
    touch(journal);
    let _ = write_journal(path, journal);
}

fn recovery_guidance() -> String {
    "サーバーを停止したまま元パスと隔離先のSHA-256を確認し、同名ファイルを上書きせず明示的に復元してください。外部変更がある場合は手動確認が必要です。".into()
}

fn target_matches_profile(
    target: &mod_management::ModManagementTarget,
    profile: &ServerProfile,
) -> bool {
    let expected = mod_management::target_for_profile(profile);
    target.game == "minecraft-java"
        && target.minecraft_version == profile.minecraft_version
        && target.loader.eq_ignore_ascii_case(&profile.server_type)
        && match (&target.loader_version, &expected.loader_version) {
            (Some(actual), Some(expected)) => actual.eq_ignore_ascii_case(expected),
            (None, None) => true,
            _ => false,
        }
        && target.java_major == profile.java_major
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};

    use super::*;
    use crate::models::{BasicSettings, ServerProfile};
    use zip::{ZipWriter, write::SimpleFileOptions};

    struct TestWorkspace {
        root: PathBuf,
        backups: PathBuf,
        profile: ServerProfile,
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
            let _ = fs::remove_dir_all(&self.backups);
        }
    }

    fn workspace(label: &str, server_type: &str) -> TestWorkspace {
        let root = std::env::temp_dir().join(format!("msh-m6-{label}-{}", Uuid::new_v4()));
        let backups = std::env::temp_dir().join(format!("msh-m6-backups-{}", Uuid::new_v4()));
        fs::create_dir_all(root.join("mods")).unwrap();
        TestWorkspace {
            profile: profile(&root, server_type),
            root,
            backups,
        }
    }

    fn profile(root: &Path, server_type: &str) -> ServerProfile {
        ServerProfile {
            id: format!("m6-{server_type}"),
            name: "M6".into(),
            root_path: root.display().to_string(),
            game_kind: "minecraft".into(),
            server_type: server_type.into(),
            minecraft_version: "1.20.1".into(),
            distribution_build: Some("47.4.10".into()),
            launch_target: "server.jar".into(),
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

    fn jar_bytes(id: &str) -> Vec<u8> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        writer
            .start_file("META-INF/mods.toml", SimpleFileOptions::default())
            .unwrap();
        write!(writer, "[[mods]]\nmodId = \"{id}\"\nversion = \"1.0.0\"\n").unwrap();
        writer.finish().unwrap().into_inner()
    }

    fn write_jar(root: &Path, file_name: &str, id: &str) -> PathBuf {
        let path = root.join("mods").join(file_name);
        fs::write(&path, jar_bytes(id)).unwrap();
        path
    }

    fn selection(path: &Path, file_name: &str) -> QuarantineSelection {
        QuarantineSelection {
            relative_path: file_name.into(),
            sha256: hash_file(path).unwrap(),
        }
    }

    fn operation_target(
        workspace: &TestWorkspace,
        operation: &QuarantineJournal,
        index: usize,
    ) -> PathBuf {
        operation_quarantine_dir(&workspace.profile, &operation.operation_id)
            .unwrap()
            .join(&operation.selected[index].quarantine_relative_path)
    }

    #[test]
    fn rejects_traversal_duplicate_and_changed_hash() {
        let workspace = workspace("validation", "forge");
        let jar = write_jar(&workspace.root, "example.jar", "example");
        let hash = hash_file(&jar).unwrap();
        assert!(
            validate_selections(
                &workspace.profile,
                vec![QuarantineSelection {
                    relative_path: "../example.jar".into(),
                    sha256: hash.clone()
                }],
                &scan_inventory(&workspace.profile).unwrap()
            )
            .is_err()
        );
        let inventory = scan_inventory(&workspace.profile).unwrap();
        assert!(
            validate_selections(
                &workspace.profile,
                vec![
                    QuarantineSelection {
                        relative_path: "example.jar".into(),
                        sha256: hash.clone()
                    },
                    QuarantineSelection {
                        relative_path: "example.jar".into(),
                        sha256: hash
                    }
                ],
                &inventory
            )
            .is_err()
        );
        fs::write(&jar, b"changed").unwrap();
        assert!(
            validate_selections(
                &workspace.profile,
                vec![QuarantineSelection {
                    relative_path: "example.jar".into(),
                    sha256: inventory.items[0].sha256.clone()
                }],
                &inventory
            )
            .is_err()
        );
    }

    #[test]
    fn selection_preserves_exact_leading_space_filename() {
        let workspace = workspace("exact-filename", "forge");
        let plain = write_jar(&workspace.root, "same.jar", "same");
        let spaced = workspace.root.join("mods/ same.jar");
        fs::write(&spaced, fs::read(&plain).unwrap()).unwrap();
        let inventory = scan_inventory(&workspace.profile).unwrap();
        let selected = validate_selections(
            &workspace.profile,
            vec![selection(&spaced, " same.jar")],
            &inventory,
        )
        .unwrap();
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].source_relative_path, " same.jar");
        assert_eq!(selected[0].file_name, " same.jar");
        assert!(
            validate_selections(
                &workspace.profile,
                vec![QuarantineSelection {
                    relative_path: " same.jar ".into(),
                    sha256: hash_file(&spaced).unwrap(),
                }],
                &inventory,
            )
            .is_err(),
            "submitted whitespace must never alias a different inventory entry"
        );
        #[cfg(windows)]
        {
            assert!(validate_relative_path("same.jar.").is_err());
            assert!(validate_relative_path("same.jar ").is_err());
        }
    }

    #[cfg(unix)]
    #[test]
    fn case_distinct_jars_are_independent_on_case_sensitive_filesystems() {
        let workspace = workspace("case-distinct", "forge");
        let upper = workspace.root.join("mods/A.jar");
        let lower = workspace.root.join("mods/a.jar");
        fs::write(&upper, b"uppercase jar").unwrap();
        fs::write(&lower, b"lowercase jar").unwrap();
        let inventory = scan_inventory(&workspace.profile).unwrap();
        if !inventory
            .items
            .iter()
            .any(|item| item.relative_path == "A.jar")
            || !inventory
                .items
                .iter()
                .any(|item| item.relative_path == "a.jar")
        {
            // macOS may use a case-insensitive temporary volume; Windows is
            // tested separately by its case-folded duplicate identity.
            return;
        }
        let selected = validate_selections(
            &workspace.profile,
            vec![selection(&upper, "A.jar"), selection(&lower, "a.jar")],
            &inventory,
        )
        .unwrap();
        assert_eq!(selected.len(), 2);
    }

    #[cfg(windows)]
    #[test]
    fn case_distinct_selection_names_are_duplicates_on_windows() {
        let workspace = workspace("windows-case-identity", "forge");
        let jar = write_jar(&workspace.root, "A.jar", "example");
        let inventory = scan_inventory(&workspace.profile).unwrap();
        let hash = hash_file(&jar).unwrap();
        assert!(
            validate_selections(
                &workspace.profile,
                vec![
                    QuarantineSelection {
                        relative_path: "A.jar".into(),
                        sha256: hash.clone(),
                    },
                    QuarantineSelection {
                        relative_path: "a.jar".into(),
                        sha256: hash,
                    },
                ],
                &inventory,
            )
            .is_err(),
            "Windows treats case-only path differences as the same selection"
        );
    }

    #[test]
    fn atomic_file_move_is_no_replace_and_preserves_source_on_conflict() {
        let workspace = workspace("atomic-move", "forge");
        let source_dir = workspace.root.join("mods");
        let destination_dir = workspace.root.join(".server-hub/quarantine-test");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(&destination_dir).unwrap();

        let source = source_dir.join("selected.jar");
        let destination = destination_dir.join("selected.jar");
        fs::write(&source, b"original selected mod").unwrap();
        rename_without_replace(&source, &destination).unwrap();
        assert!(!source.exists());
        assert_eq!(fs::read(&destination).unwrap(), b"original selected mod");

        let conflicting_source = source_dir.join("conflicting.jar");
        let existing_destination = destination_dir.join("conflicting.jar");
        fs::write(&conflicting_source, b"source must survive").unwrap();
        fs::write(&existing_destination, b"existing destination must survive").unwrap();
        assert!(rename_without_replace(&conflicting_source, &existing_destination).is_err());
        assert_eq!(
            fs::read(&conflicting_source).unwrap(),
            b"source must survive"
        );
        assert_eq!(
            fs::read(&existing_destination).unwrap(),
            b"existing destination must survive"
        );
    }

    #[test]
    fn real_apply_creates_backup_moves_only_selected_jar_and_commits_on_fresh_ready() {
        let workspace = workspace("happy-path", "forge");
        let jar = write_jar(&workspace.root, "client-hud.jar", "clienthud");
        let jar_bytes = fs::read(&jar).unwrap();
        let disabled = workspace.root.join(".server-hub/disabled/mod/legacy.jar");
        fs::create_dir_all(disabled.parent().unwrap()).unwrap();
        fs::write(&disabled, b"leave disabled content alone").unwrap();
        let selected = selection(&jar, "client-hud.jar");

        let mut operation = apply(
            &workspace.profile,
            &workspace.backups,
            vec![selected.clone()],
            APPLY_CONFIRMATION,
        )
        .unwrap();

        assert_eq!(operation.status, "awaiting-launch-validation");
        assert!(operation.backup_id.is_some());
        assert!(!jar.exists());
        assert_eq!(
            fs::read(operation_target(&workspace, &operation, 0)).unwrap(),
            jar_bytes
        );
        assert_eq!(fs::read(disabled).unwrap(), b"leave disabled content alone");
        assert!(
            apply(
                &workspace.profile,
                &workspace.backups,
                vec![selected],
                APPLY_CONFIRMATION,
            )
            .is_err(),
            "an unresolved launch validation must block a second operation"
        );

        let attempt_started_at = Utc::now().to_rfc3339();
        let mut wrong_target = mod_management::target_for_profile(&workspace.profile);
        wrong_target.loader_version = Some("not-the-installed-loader".into());
        bind_launch_attempt(
            &workspace.profile,
            "wrong-target-attempt",
            &attempt_started_at,
            &wrong_target,
        )
        .unwrap();
        operation = list(&workspace.profile).unwrap().operations.remove(0);
        assert!(operation.launch_validation.attempt_id.is_none());

        let attempt_id = "fresh-ready-attempt";
        bind_launch_attempt(
            &workspace.profile,
            attempt_id,
            &attempt_started_at,
            &mod_management::target_for_profile(&workspace.profile),
        )
        .unwrap();
        on_launch_ready(
            &workspace.profile,
            LaunchValidationInput {
                attempt_id,
                started_at: &attempt_started_at,
                ready_at: Some(&Utc::now().to_rfc3339()),
                failure_code: None,
            },
        )
        .unwrap();
        assert_eq!(
            list(&workspace.profile).unwrap().operations[0].status,
            "committed"
        );
    }

    #[test]
    fn reopening_each_interrupted_apply_checkpoint_requires_recovery_without_losing_jars() {
        let checkpoints = [
            "planned",
            "backup-created",
            "move-started",
            "one-file-moved",
            "quarantined",
            "rechecking",
            "awaiting-launch-validation",
        ];
        for checkpoint_name in checkpoints {
            let workspace = workspace(checkpoint_name, "forge");
            let first = write_jar(&workspace.root, "a.jar", "moda");
            let second = write_jar(&workspace.root, "b.jar", "modb");
            let selections = vec![selection(&first, "a.jar"), selection(&second, "b.jar")];
            let result = apply_with_checkpoint(
                &workspace.profile,
                &workspace.backups,
                selections,
                APPLY_CONFIRMATION,
                |stage| {
                    if stage == checkpoint_name {
                        Err(AppError::Other(format!("simulated stop after {stage}")))
                    } else {
                        Ok(())
                    }
                },
            );
            assert!(
                result.is_err(),
                "checkpoint {checkpoint_name} should interrupt apply"
            );
            let overview = list(&workspace.profile).unwrap();
            assert_eq!(overview.operations.len(), 1);
            let operation = &overview.operations[0];
            if checkpoint_name == "awaiting-launch-validation" {
                assert_eq!(operation.status, "awaiting-launch-validation");
            } else {
                assert_eq!(operation.status, "needs-recovery", "{checkpoint_name}");
            }
            for item in &operation.selected {
                let active = workspace.root.join("mods").join(&item.source_relative_path);
                let isolated =
                    operation_quarantine_dir(&workspace.profile, &operation.operation_id)
                        .unwrap()
                        .join(&item.quarantine_relative_path);
                assert_ne!(
                    active.exists(),
                    isolated.exists(),
                    "{} at {checkpoint_name}",
                    item.file_name
                );
                let surviving = if active.exists() { active } else { isolated };
                assert_eq!(
                    hash_file(&surviving).unwrap(),
                    item.sha256,
                    "{} at {checkpoint_name}",
                    item.file_name
                );
            }
        }
    }

    #[test]
    fn interrupted_partial_restore_reopens_and_retries_idempotently() {
        let workspace = workspace("partial-restore", "forge");
        let first = write_jar(&workspace.root, "a.jar", "moda");
        let second = write_jar(&workspace.root, "b.jar", "modb");
        let operation = apply(
            &workspace.profile,
            &workspace.backups,
            vec![selection(&first, "a.jar"), selection(&second, "b.jar")],
            APPLY_CONFIRMATION,
        )
        .unwrap();

        let interrupted = restore_with_checkpoint(
            &workspace.profile,
            &operation.operation_id,
            RESTORE_CONFIRMATION,
            |stage| {
                if stage == "one-file-restored" {
                    Err(AppError::Other(
                        "simulated stop after first restored file".into(),
                    ))
                } else {
                    Ok(())
                }
            },
        );
        assert!(interrupted.is_err());
        let reopened = list(&workspace.profile).unwrap().operations.remove(0);
        assert_eq!(reopened.status, "needs-recovery");
        assert_eq!(
            reopened
                .selected
                .iter()
                .filter(|item| item.restored)
                .count(),
            1
        );

        let restored = restore(
            &workspace.profile,
            &operation.operation_id,
            RESTORE_CONFIRMATION,
        )
        .unwrap();
        assert_eq!(restored.status, "restored");
        assert!(workspace.root.join("mods/a.jar").is_file());
        assert!(workspace.root.join("mods/b.jar").is_file());
        assert!(
            restored
                .selected
                .iter()
                .all(|item| item.restored && !item.moved)
        );
    }

    #[test]
    fn restore_conflict_and_changed_quarantine_hash_never_overwrite_or_move() {
        let workspace = workspace("restore-conflicts", "forge");
        let first = write_jar(&workspace.root, "conflict.jar", "conflict");
        let original_selection = selection(&first, "conflict.jar");
        let operation = apply(
            &workspace.profile,
            &workspace.backups,
            vec![original_selection],
            APPLY_CONFIRMATION,
        )
        .unwrap();
        let isolated = operation_target(&workspace, &operation, 0);
        fs::write(&first, b"external replacement").unwrap();
        assert!(
            restore(
                &workspace.profile,
                &operation.operation_id,
                RESTORE_CONFIRMATION
            )
            .is_err()
        );
        assert_eq!(fs::read(&first).unwrap(), b"external replacement");
        assert_eq!(hash_file(&isolated).unwrap(), operation.selected[0].sha256);

        fs::remove_file(&first).unwrap();
        fs::write(&isolated, b"changed quarantined bytes").unwrap();
        assert!(
            restore(
                &workspace.profile,
                &operation.operation_id,
                RESTORE_CONFIRMATION
            )
            .is_err()
        );
        assert!(!first.exists());
        assert_eq!(fs::read(&isolated).unwrap(), b"changed quarantined bytes");
    }

    #[test]
    fn stale_hash_selection_is_rejected_before_journal_or_move() {
        let workspace = workspace("changed-preflight", "forge");
        let jar = write_jar(&workspace.root, "example.jar", "example");
        let stale_selection = selection(&jar, "example.jar");
        fs::write(&jar, b"external update").unwrap();

        assert!(
            apply(
                &workspace.profile,
                &workspace.backups,
                vec![stale_selection],
                APPLY_CONFIRMATION,
            )
            .is_err()
        );
        assert_eq!(fs::read(&jar).unwrap(), b"external update");
        assert!(!operations_dir(&workspace.profile).exists());
    }

    #[test]
    fn ready_failure_marks_recovery_without_implicit_restore() {
        let workspace = workspace("fresh-failure", "forge");
        let jar = write_jar(&workspace.root, "example.jar", "example");
        let _operation = apply(
            &workspace.profile,
            &workspace.backups,
            vec![selection(&jar, "example.jar")],
            APPLY_CONFIRMATION,
        )
        .unwrap();
        let attempt_started_at = Utc::now().to_rfc3339();
        let target = mod_management::target_for_profile(&workspace.profile);
        bind_launch_attempt(
            &workspace.profile,
            "failed-attempt",
            &attempt_started_at,
            &target,
        )
        .unwrap();
        on_launch_failure(
            &workspace.profile,
            LaunchValidationInput {
                attempt_id: "failed-attempt",
                started_at: &attempt_started_at,
                ready_at: None,
                failure_code: Some("mod-loading-exception"),
            },
        )
        .unwrap();
        let operation = list(&workspace.profile).unwrap().operations.remove(0);
        assert_eq!(operation.status, "needs-recovery");
        assert!(!workspace.root.join("mods/example.jar").exists());
        assert!(operation_target(&workspace, &operation, 0).is_file());
    }

    #[test]
    fn rejects_bedrock_palworld_and_hardlinked_active_mods() {
        let workspace = workspace("unsupported-targets", "forge");
        let mut bedrock = workspace.profile.clone();
        bedrock.server_type = "bedrock".into();
        let mut palworld = workspace.profile.clone();
        palworld.game_kind = "palworld".into();
        palworld.server_type = "palworld".into();
        assert!(list_candidates(&bedrock).is_err());
        assert!(list_candidates(&palworld).is_err());
        assert!(apply(&bedrock, &workspace.backups, vec![], APPLY_CONFIRMATION).is_err());
        assert!(apply(&palworld, &workspace.backups, vec![], APPLY_CONFIRMATION).is_err());

        let jar = write_jar(&workspace.root, "linked.jar", "linked");
        let external_link = workspace.root.join("linked-outside.jar");
        fs::hard_link(&jar, &external_link).unwrap();
        assert!(validate_regular_mod_path(&workspace.profile, "linked.jar").is_err());
        fs::remove_file(external_link).unwrap();
    }

    #[test]
    fn operation_journal_filename_and_symlink_ancestors_are_rejected() {
        let workspace = workspace("journal-safety", "forge");
        let root = Path::new(&workspace.profile.root_path);
        assert!(reject_reparse_ancestors(&root.join("mods/example.jar")).is_ok());
        assert!(
            reject_reparse_ancestors(&root.canonicalize().unwrap().join("mods/example.jar"))
                .is_ok()
        );
        let wrong_path = workspace.root.join("different.json");
        let journal = QuarantineJournal {
            schema_version: QUARANTINE_SCHEMA_VERSION,
            operation_id: "expected-id".into(),
            server_id: workspace.profile.id.clone(),
            status: "planned".into(),
            stage: "planned".into(),
            selected: Vec::new(),
            backup_id: None,
            planned_at: "now".into(),
            updated_at: "now".into(),
            inventory_before_fingerprint: None,
            inventory_after_fingerprint: None,
            launch_validation: LaunchValidationReference::default(),
            last_error: None,
            recovery_guidance: "review".into(),
        };
        atomic_json_write(&wrong_path, &journal, MAX_OPERATION_BYTES).unwrap();
        assert!(read_journal(&wrong_path).is_err());

        let operations_parent = operations_dir(&workspace.profile)
            .parent()
            .unwrap()
            .to_path_buf();
        fs::create_dir_all(&operations_parent).unwrap();
        let outside = workspace.root.join("outside-operations");
        fs::create_dir_all(&outside).unwrap();
        let operations = operations_dir(&workspace.profile);
        #[cfg(windows)]
        let link_result = std::os::windows::fs::symlink_dir(&outside, &operations);
        #[cfg(unix)]
        let link_result = std::os::unix::fs::symlink(&outside, &operations);
        if link_result.is_ok() {
            assert!(load_journals(&workspace.profile).is_err());
            assert!(list(&workspace.profile).is_err());
        }
    }

    #[test]
    fn atomic_journal_failure_does_not_overwrite_old_bytes() {
        let workspace = workspace("atomic", "forge");
        let path = operations_dir(&workspace.profile).join("x.json");
        let first = QuarantineJournal {
            schema_version: 1,
            operation_id: "x".into(),
            server_id: "s".into(),
            status: "planned".into(),
            stage: "planned".into(),
            selected: Vec::new(),
            backup_id: None,
            planned_at: "a".into(),
            updated_at: "a".into(),
            inventory_before_fingerprint: None,
            inventory_after_fingerprint: None,
            launch_validation: LaunchValidationReference::default(),
            last_error: None,
            recovery_guidance: "r".into(),
        };
        write_journal(&path, &first).unwrap();
        FAIL_ATOMIC_WRITE.with(|fail| fail.set(true));
        assert!(
            write_journal(
                &path,
                &QuarantineJournal {
                    status: "changed".into(),
                    ..first.clone()
                }
            )
            .is_err()
        );
        FAIL_ATOMIC_WRITE.with(|fail| fail.set(false));
        assert_eq!(read_journal(&path).unwrap().status, "planned");
        assert_eq!(
            fs::read_dir(operations_dir(&workspace.profile))
                .unwrap()
                .count(),
            1,
            "failed atomic replacement must remove its temporary file"
        );
        write_journal(
            &path,
            &QuarantineJournal {
                status: "needs-recovery".into(),
                stage: "reconcile-test".into(),
                ..first
            },
        )
        .unwrap();
        assert_eq!(read_journal(&path).unwrap().status, "needs-recovery");
    }
}
