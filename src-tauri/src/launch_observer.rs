//! Phase M5 loader-aware launch observation.
//!
//! The observer deliberately sits beside the existing process registry.  It
//! only consumes the stdout/stderr lines that the process reader already owns
//! and stores a small, redacted, atomic sidecar record.  It never moves,
//! deletes, or edits a mod file.  Bedrock and Palworld do not use this module;
//! their existing native lifecycle remains unchanged.

use std::{
    fs::{self, OpenOptions},
    io,
    path::{Path, PathBuf},
    process::ExitStatus,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, AtomicUsize, Ordering},
        mpsc::{Receiver, SyncSender, TrySendError, sync_channel},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    mod_management::{self, ModManagementTarget},
    models::{DiagnosisIssue, ServerProfile},
    quarantine,
};

pub const LAUNCH_ATTEMPT_SCHEMA_VERSION: u32 = 1;
pub const MAX_LAUNCH_HISTORY: usize = 50;
pub const MAX_LOG_EVIDENCE: usize = 120;
pub const MAX_LOG_LINE_CHARS: usize = 512;
pub const MAX_WARNING_CODES: usize = 16;
pub const MAX_QUARANTINE_CANDIDATES: usize = 32;
const MAX_ATTEMPT_BYTES: usize = 2 * 1024 * 1024;
const PERSISTENCE_QUEUE_CAPACITY: usize = 1;
const EVIDENCE_PERSIST_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchLogEvidence {
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuarantineCandidate {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mod_id: Option<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchAttempt {
    pub schema_version: u32,
    pub attempt_id: String,
    pub server_id: String,
    /// `starting`, `ready`, `failed`, or `exited`.
    pub state: String,
    pub started_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ready_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    pub target: ModManagementTarget,
    #[serde(default)]
    pub log_evidence: Vec<LaunchLogEvidence>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fatal_code: Option<String>,
    #[serde(default)]
    pub warning_codes: Vec<String>,
    #[serde(default)]
    pub quarantine_candidates: Vec<QuarantineCandidate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoaderObservation {
    None,
    Ready,
    Fatal(&'static str),
    Warning(&'static str),
}

#[derive(Debug, Clone)]
pub struct LaunchObserver {
    shared: Arc<ObserverShared>,
}

#[derive(Debug)]
struct ObserverShared {
    inner: Mutex<ObserverInner>,
    revision: Arc<AtomicU64>,
    write_lock: Arc<Mutex<()>>,
    persist_writes: Arc<AtomicUsize>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Debug)]
struct ObserverInner {
    profile: ServerProfile,
    path: PathBuf,
    attempt: LaunchAttempt,
    persist_tx: Option<SyncSender<PersistMessage>>,
    last_enqueue_at: Instant,
    closed: bool,
    /// A fatal loader error should result in one graceful stop request.  The
    /// process registry performs the actual stdin write outside this module.
    safe_stop_requested: bool,
}

#[derive(Debug)]
enum PersistMessage {
    Snapshot(PersistSnapshot),
}

#[derive(Debug)]
struct PersistSnapshot {
    path: PathBuf,
    attempt: LaunchAttempt,
    revision: u64,
}

impl Drop for ObserverShared {
    fn drop(&mut self) {
        // The process lifecycle normally closes the observer via mark_exit or
        // mark_spawn_failed.  Keep the fallback bounded as well: dropping the
        // last observer must disconnect and join its single worker instead of
        // leaking one thread per abandoned launch.
        match self.inner.get_mut() {
            Ok(inner) => {
                inner.persist_tx.take();
            }
            Err(poisoned) => {
                poisoned.into_inner().persist_tx.take();
            }
        }
        let worker = self.worker.get_mut().ok().and_then(Option::take);
        if let Some(worker) = worker {
            let _ = worker.join();
        }
    }
}

impl LaunchObserver {
    /// Start a sidecar record for Java loaders supported by M5.  Native
    /// Bedrock/Palworld launches return `None` so their lifecycle is untouched.
    pub fn begin(profile: &ServerProfile) -> AppResult<Option<Self>> {
        if !is_observed_profile(profile) {
            return Ok(None);
        }
        let root = Path::new(&profile.root_path);
        let directory = attempts_dir(root)?;
        fs::create_dir_all(&directory)?;
        reject_symlink(&directory)?;
        // Leave one slot for the record being created.  A second pass after
        // the write closes the small race where another local actor creates a
        // record between the two operations.
        prune_launch_attempts(&directory, MAX_LAUNCH_HISTORY.saturating_sub(1))?;
        let now = Utc::now().to_rfc3339();
        let attempt = LaunchAttempt {
            schema_version: LAUNCH_ATTEMPT_SCHEMA_VERSION,
            attempt_id: Uuid::new_v4().to_string(),
            server_id: profile.id.clone(),
            state: "starting".into(),
            started_at: now,
            ready_at: None,
            ended_at: None,
            target: mod_management::target_for_profile(profile),
            log_evidence: Vec::new(),
            fatal_code: None,
            warning_codes: Vec::new(),
            quarantine_candidates: Vec::new(),
            exit_code: None,
        };
        let path = directory.join(format!("{}.json", attempt.attempt_id));
        write_attempt_atomically(&path, &attempt)?;
        prune_launch_attempts(&directory, MAX_LAUNCH_HISTORY)?;
        // M6 binds only the next matching lifecycle attempt.  A failure to
        // update a quarantine sidecar must not prevent a normal Java launch;
        // the operation remains recoverable through the next list/open pass.
        let _ = quarantine::bind_launch_attempt(
            profile,
            &attempt.attempt_id,
            &attempt.started_at,
            &attempt.target,
        );

        let (persist_tx, persist_rx) = sync_channel(PERSISTENCE_QUEUE_CAPACITY);
        let revision = Arc::new(AtomicU64::new(0));
        let write_lock = Arc::new(Mutex::new(()));
        let persist_writes = Arc::new(AtomicUsize::new(1));
        let worker_revision = Arc::clone(&revision);
        let worker_write_lock = Arc::clone(&write_lock);
        let worker_writes = Arc::clone(&persist_writes);
        let worker = thread::Builder::new()
            .name("msh-launch-persist".into())
            .spawn(move || {
                persistence_worker(
                    persist_rx,
                    worker_revision,
                    worker_write_lock,
                    worker_writes,
                )
            })?;
        Ok(Some(Self {
            shared: Arc::new(ObserverShared {
                inner: Mutex::new(ObserverInner {
                    profile: profile.clone(),
                    path,
                    attempt,
                    persist_tx: Some(persist_tx),
                    last_enqueue_at: Instant::now(),
                    closed: false,
                    safe_stop_requested: false,
                }),
                revision,
                write_lock,
                persist_writes,
                worker: Mutex::new(Some(worker)),
            }),
        }))
    }

    /// Observe one complete stdout/stderr line.  The caller is a dedicated
    /// reader thread; no Tauri or process-map lock is held while parsing.
    pub fn observe_line(&self, level: &str, line: &str) {
        let mut inner = self
            .shared
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if inner.closed {
            return;
        }
        let before_ready = inner.attempt.ready_at.is_some();
        let observation = classify_loader_line(&inner.attempt.target.loader, line, before_ready);
        let redacted = redact_log_line(line);
        push_log_evidence(
            &mut inner.attempt.log_evidence,
            LaunchLogEvidence {
                timestamp: Utc::now().to_rfc3339(),
                level: bounded_text(level, 32),
                message: redacted,
            },
        );

        let mut state_transition = false;
        let mut ready_at = None;
        let mut failure_code = None;
        match observation {
            LoaderObservation::None => {}
            LoaderObservation::Ready => {
                if inner.attempt.ready_at.is_none() && inner.attempt.state == "starting" {
                    let timestamp = Utc::now().to_rfc3339();
                    inner.attempt.ready_at = Some(timestamp.clone());
                    inner.attempt.state = "ready".into();
                    state_transition = true;
                    // A Ready marker is the only place where the V2 state is
                    // allowed to advance lastSuccessfulLaunch.
                    ready_at = Some(timestamp);
                }
            }
            LoaderObservation::Fatal(code) => {
                state_transition =
                    inner.attempt.state != "failed" || inner.attempt.fatal_code.is_none();
                if inner.attempt.fatal_code.is_none() {
                    inner.attempt.fatal_code = Some(code.into());
                }
                inner.attempt.state = "failed".into();
                failure_code = Some(code);
                let candidate = candidate_from_line(line, code);
                add_candidate(&mut inner.attempt.quarantine_candidates, candidate);
            }
            LoaderObservation::Warning(code) => {
                if !inner
                    .attempt
                    .warning_codes
                    .iter()
                    .any(|value| value == code)
                    && inner.attempt.warning_codes.len() < MAX_WARNING_CODES
                {
                    inner.attempt.warning_codes.push(code.into());
                }
                // Warnings never change a Ready attempt to failed.  Before
                // Ready they are retained as evidence while startup proceeds.
            }
        }

        // Ordinary lines share the current state revision so a queued
        // snapshot remains useful while more evidence arrives.  Only a
        // Ready/fatal state transition invalidates older queued snapshots.
        let revision = if state_transition {
            self.shared.revision.fetch_add(1, Ordering::AcqRel) + 1
        } else {
            self.shared.revision.load(Ordering::Acquire)
        };
        if state_transition {
            // Ready and deterministic fatal transitions are synchronously
            // persisted before returning to the reader.  They are rare state
            // changes, while ordinary log evidence never performs a file
            // operation on this path.
            let _ = persist_attempt_locked(&self.shared, &inner);
            inner.last_enqueue_at = Instant::now();
            if let Some(ready_at) = ready_at {
                // This is a single loader state transition, so a synchronous
                // sidecar update is bounded and deterministic.  High-volume
                // ordinary evidence never enters this path.
                let _ = mod_management::mark_successful_launch(&inner.profile, &ready_at);
                let _ = quarantine::on_launch_ready(
                    &inner.profile,
                    quarantine::LaunchValidationInput {
                        attempt_id: &inner.attempt.attempt_id,
                        started_at: &inner.attempt.started_at,
                        ready_at: Some(&ready_at),
                        failure_code: None,
                    },
                );
            } else if let Some(failure_code) = failure_code {
                let _ = quarantine::on_launch_failure(
                    &inner.profile,
                    quarantine::LaunchValidationInput {
                        attempt_id: &inner.attempt.attempt_id,
                        started_at: &inner.attempt.started_at,
                        ready_at: None,
                        failure_code: Some(failure_code),
                    },
                );
            }
        } else {
            enqueue_evidence_snapshot(&mut inner, revision);
        }
    }

    pub fn mark_spawn_failed(&self, message: &str) {
        let worker = {
            let mut inner = self
                .shared
                .inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if inner.closed {
                return;
            }
            let attempt_id = inner.attempt.attempt_id.clone();
            let started_at = inner.attempt.started_at.clone();
            let worker = finalize_attempt(&self.shared, &mut inner, |attempt| {
                attempt.state = "failed".into();
                attempt
                    .fatal_code
                    .get_or_insert_with(|| "spawn-failed".into());
                push_log_evidence(
                    &mut attempt.log_evidence,
                    LaunchLogEvidence {
                        timestamp: Utc::now().to_rfc3339(),
                        level: "ERROR".into(),
                        message: redact_log_line(message),
                    },
                );
                attempt.ended_at = Some(Utc::now().to_rfc3339());
            });
            let _ = quarantine::on_launch_failure(
                &inner.profile,
                quarantine::LaunchValidationInput {
                    attempt_id: &attempt_id,
                    started_at: &started_at,
                    ready_at: None,
                    failure_code: Some("spawn-failed"),
                },
            );
            worker
        };
        self.join_worker(worker);
    }

    pub fn mark_exit(&self, status: ExitStatus) {
        self.mark_exit_code(status.code());
    }

    pub fn mark_exit_code(&self, code: Option<i32>) {
        let worker = {
            let mut inner = self
                .shared
                .inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if inner.closed {
                return;
            }
            let attempt_id = inner.attempt.attempt_id.clone();
            let started_at = inner.attempt.started_at.clone();
            let worker = finalize_attempt(&self.shared, &mut inner, |attempt| {
                attempt.exit_code = code;
                if attempt.state == "ready" {
                    attempt.state = "exited".into();
                } else if attempt.state == "starting" {
                    attempt.state = "failed".into();
                    attempt.fatal_code.get_or_insert_with(|| {
                        if code == Some(0) {
                            "exited-before-ready"
                        } else {
                            "non-zero-before-ready"
                        }
                        .into()
                    });
                }
                attempt.ended_at = Some(Utc::now().to_rfc3339());
            });
            if inner.attempt.state == "failed" {
                let failure_code = inner.attempt.fatal_code.clone();
                let _ = quarantine::on_launch_failure(
                    &inner.profile,
                    quarantine::LaunchValidationInput {
                        attempt_id: &attempt_id,
                        started_at: &started_at,
                        ready_at: None,
                        failure_code: failure_code.as_deref(),
                    },
                );
            }
            worker
        };
        self.join_worker(worker);
    }

    pub fn is_ready(&self) -> bool {
        let inner = self
            .shared
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        inner.attempt.state == "ready" || inner.attempt.state == "exited"
    }

    pub fn is_failed(&self) -> bool {
        self.shared
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .attempt
            .state
            == "failed"
    }

    /// Returns true once for a fatal attempt.  The process layer turns this
    /// into a graceful `stop` stdin request; it never force-kills a loader.
    pub fn take_safe_stop_request(&self) -> bool {
        let mut inner = self
            .shared
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if inner.attempt.state == "failed" && !inner.safe_stop_requested {
            inner.safe_stop_requested = true;
            return true;
        }
        false
    }

    #[cfg(test)]
    fn persisted_write_count(&self) -> usize {
        self.shared.persist_writes.load(Ordering::Acquire)
    }

    fn join_worker(&self, sender: Option<SyncSender<PersistMessage>>) {
        // Dropping the final sender lets a queued ordinary snapshot finish
        // and then terminates the single worker.  Its revision check prevents
        // that stale snapshot from overwriting the final state.
        drop(sender);
        let worker = self
            .shared
            .worker
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take();
        if let Some(worker) = worker {
            let _ = worker.join();
        }
    }
}

fn persistence_worker(
    receiver: Receiver<PersistMessage>,
    revision: Arc<AtomicU64>,
    write_lock: Arc<Mutex<()>>,
    persist_writes: Arc<AtomicUsize>,
) {
    while let Ok(message) = receiver.recv() {
        match message {
            PersistMessage::Snapshot(snapshot) => {
                persist_snapshot_if_current(&revision, &write_lock, &persist_writes, snapshot);
            }
        }
    }
}

fn persist_snapshot_if_current(
    revision: &AtomicU64,
    write_lock: &Mutex<()>,
    persist_writes: &AtomicUsize,
    snapshot: PersistSnapshot,
) {
    let _guard = write_lock
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if revision.load(Ordering::Acquire) != snapshot.revision {
        return;
    }
    if write_attempt_atomically(&snapshot.path, &snapshot.attempt).is_ok() {
        persist_writes.fetch_add(1, Ordering::AcqRel);
    }
}

fn persist_attempt_locked(shared: &ObserverShared, inner: &ObserverInner) -> AppResult<()> {
    let _guard = shared
        .write_lock
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let result = write_attempt_atomically(&inner.path, &inner.attempt);
    if result.is_ok() {
        shared.persist_writes.fetch_add(1, Ordering::AcqRel);
    }
    result
}

fn enqueue_evidence_snapshot(inner: &mut ObserverInner, revision: u64) {
    let now = Instant::now();
    if now.duration_since(inner.last_enqueue_at) < EVIDENCE_PERSIST_INTERVAL {
        return;
    }
    inner.last_enqueue_at = now;
    let Some(sender) = inner.persist_tx.as_ref() else {
        return;
    };
    let snapshot = PersistSnapshot {
        path: inner.path.clone(),
        attempt: inner.attempt.clone(),
        revision,
    };
    match sender.try_send(PersistMessage::Snapshot(snapshot)) {
        Ok(()) | Err(TrySendError::Full(_)) => {}
        Err(TrySendError::Disconnected(_)) => {
            inner.persist_tx = None;
        }
    }
}

fn finalize_attempt<F>(
    shared: &ObserverShared,
    inner: &mut ObserverInner,
    mutate: F,
) -> Option<SyncSender<PersistMessage>>
where
    F: FnOnce(&mut LaunchAttempt),
{
    mutate(&mut inner.attempt);
    shared.revision.fetch_add(1, Ordering::AcqRel);
    // Prevent buffered reader lines from mutating the record after this final
    // snapshot has been written.
    inner.closed = true;
    let _ = persist_attempt_locked(shared, inner);
    inner.persist_tx.take()
}

pub fn is_observed_profile(profile: &ServerProfile) -> bool {
    if profile.game_adapter().is_palworld() || profile.server_type.eq_ignore_ascii_case("bedrock") {
        return false;
    }
    matches!(
        profile.server_type.to_ascii_lowercase().as_str(),
        "forge" | "neoforge" | "fabric" | "quilt" | "paper" | "vanilla"
    )
}

/// Loader-specific classification intentionally requires deterministic fatal
/// phrases.  A bare `[ERROR]` or `Exception` is not fatal because mods and
/// Paper plugins can log recoverable errors before reaching Ready.
pub fn classify_loader_line(loader: &str, line: &str, ready: bool) -> LoaderObservation {
    let lower = line.to_ascii_lowercase();
    if fatal_code(&lower).is_some() {
        return LoaderObservation::Fatal(fatal_code(&lower).unwrap_or("loader-fatal"));
    }
    if is_ready_marker(loader, &lower) {
        return LoaderObservation::Ready;
    }
    if let Some(code) = warning_code(&lower) {
        // Keep the `ready` argument in the API to make the post-ready
        // non-fatal rule explicit and testable.  A warning is retained in both
        // phases; it never becomes fatal simply because it is pre-ready.
        let _ = ready;
        return LoaderObservation::Warning(code);
    }
    LoaderObservation::None
}

fn is_ready_marker(loader: &str, line: &str) -> bool {
    // A loader banner or generic "server started" line can be emitted before
    // plugins/mods finish loading.  M6 commits only after Java's definitive
    // vanilla startup marker; supported loaders all emit this on successful
    // startup, including Forge, Fabric, and Paper.
    matches!(
        loader.to_ascii_lowercase().as_str(),
        "forge" | "neoforge" | "fabric" | "quilt" | "paper" | "vanilla"
    ) && line.contains("done (")
        && line.contains(")! for help")
}

fn fatal_code(line: &str) -> Option<&'static str> {
    if line.contains("modloadingexception") {
        Some("mod-loading-exception")
    } else if line.contains("loadingfailedexception") {
        Some("loading-failed")
    } else if line.contains("failed to create mod instance") {
        Some("failed-mod-instance")
    } else if DUPLICATE_MOD.is_match(line) {
        Some("duplicate-mod")
    } else if MISSING_DEPENDENCY.is_match(line) {
        Some("missing-dependency")
    } else if INCOMPATIBLE_MOD.is_match(line) {
        Some("incompatible-mod")
    } else if line.contains("crash report") || line.contains("crash-report") {
        Some("crash-report")
    } else {
        None
    }
}

fn warning_code(line: &str) -> Option<&'static str> {
    if is_invalid_dist_probe(line) {
        Some("invalid-dist-probe")
    } else if (line.contains("loot table") || line.contains("loot_table"))
        && (line.contains("warn")
            || line.contains("error")
            || line.contains("missing name")
            || line.contains("could not load")
            || line.contains("couldn't load")
            || line.contains("failed to load"))
    {
        Some("loot-table-warning")
    } else if line.contains("deprecated") || line.contains("deprecation") {
        Some("deprecated-api")
    } else if line.contains("[warn") || line.contains("warning") {
        Some("loader-warning")
    } else {
        None
    }
}

fn is_invalid_dist_probe(line: &str) -> bool {
    let dedicated_server = line.contains("dedicated_server") || line.contains("dedicated server");
    dedicated_server && (line.contains("invalid dist") || line.contains("attempted to load class"))
}

fn legacy_invalid_dist_probe_ready(attempt: &LaunchAttempt) -> bool {
    attempt.state == "failed"
        && attempt.fatal_code.as_deref() == Some("invalid-dist-client-only")
        && attempt.exit_code == Some(0)
        && (attempt.ready_at.is_some()
            || attempt.log_evidence.iter().any(|entry| {
                is_ready_marker(&attempt.target.loader, &entry.message.to_ascii_lowercase())
            }))
        && !attempt
            .log_evidence
            .iter()
            .any(|entry| fatal_code(&entry.message.to_ascii_lowercase()).is_some())
}

static DUPLICATE_MOD: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)(duplicate\s+(?:mods?|mod\s+id)|mod\s+id[^\n]*already\s+(?:exists|loaded))")
        .expect("duplicate mod regex")
});
static MISSING_DEPENDENCY: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)(missing\s+(?:required\s+)?dependenc|required\s+dependency[^\n]*(?:missing|not\s+found)|depends\s+on[^\n]*(?:missing|not\s+found))")
        .expect("missing dependency regex")
});
static INCOMPATIBLE_MOD: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)(incompatible\s+mod|mod[^\n]*(?:requires|incompatible with)[^\n]*(?:version|minecraft|loader))")
        .expect("incompatible mod regex")
});
static ABSOLUTE_PATH: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r#"(?i)(?:[a-z]:[\\/]|\\\\)[^\s\"']+"#).expect("absolute path regex")
});
static IPV4: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b").expect("ipv4 regex")
});
static SECRET: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)\b((?:password|passwd|token|secret|authorization|api[_-]?key|access[_-]?token))\b\s*[:=]\s*[^\s,;]+")
        .expect("secret regex")
});
static URL: std::sync::LazyLock<Regex> =
    std::sync::LazyLock::new(|| Regex::new(r"(?i)https?://[^\s]+").expect("url regex"));
static JAR_NAME: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)([A-Za-z0-9_.-]{1,160}\.jar)").expect("jar name regex")
});
static MOD_ID: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)(?:mod\s*id|modid|mod)\s*[:=]\s*([a-z0-9][a-z0-9_.-]{1,63})")
        .expect("mod id regex")
});

pub fn redact_log_line(value: &str) -> String {
    let mut result = bounded_text(value, MAX_LOG_LINE_CHARS);
    result = SECRET.replace_all(&result, "$1=[REDACTED]").into_owned();
    result = URL.replace_all(&result, "[URL]").into_owned();
    result = ABSOLUTE_PATH.replace_all(&result, "[PATH]").into_owned();
    IPV4.replace_all(&result, "[IP]").into_owned()
}

fn bounded_text(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn push_log_evidence(logs: &mut Vec<LaunchLogEvidence>, entry: LaunchLogEvidence) {
    if logs.len() >= MAX_LOG_EVIDENCE {
        let overflow = logs.len() + 1 - MAX_LOG_EVIDENCE;
        logs.drain(0..overflow);
    }
    logs.push(entry);
}

fn candidate_from_line(line: &str, code: &str) -> QuarantineCandidate {
    let file_name = JAR_NAME
        .captures(line)
        .and_then(|capture| capture.get(1).map(|value| value.as_str().to_string()));
    let mod_id = MOD_ID
        .captures(line)
        .and_then(|capture| capture.get(1).map(|value| value.as_str().to_string()));
    QuarantineCandidate {
        file_name,
        mod_id,
        reason: code.into(),
    }
}

fn add_candidate(candidates: &mut Vec<QuarantineCandidate>, candidate: QuarantineCandidate) {
    if candidate.file_name.is_none() && candidate.mod_id.is_none() {
        return;
    }
    if candidates.iter().any(|item| item == &candidate) {
        return;
    }
    if candidates.len() < MAX_QUARANTINE_CANDIDATES {
        candidates.push(candidate);
    }
}

pub fn attempts_dir(root: &Path) -> AppResult<PathBuf> {
    let server_hub = root.join(".server-hub");
    let management = server_hub.join("mod-management");
    let directory = management.join("launch-attempts");
    for path in [&server_hub, &management, &directory] {
        reject_symlink(path)?;
    }
    Ok(directory)
}

fn prune_launch_attempts(directory: &Path, keep_count: usize) -> AppResult<()> {
    reject_symlink(directory)?;
    let mut candidates = Vec::new();
    for entry in fs::read_dir(directory)?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let metadata = match fs::symlink_metadata(&path) {
            Ok(value) if !is_reparse_or_symlink(&value) && value.is_file() => value,
            // Never follow or delete a symlink/reparse entry.  A malformed
            // history file is still safe to prune as an old launch record.
            _ => continue,
        };
        let modified = metadata.modified().unwrap_or(std::time::UNIX_EPOCH);
        candidates.push((modified, path));
    }
    if candidates.len() <= keep_count {
        return Ok(());
    }
    candidates.sort_by(|left, right| left.cmp(right));
    let remove_count = candidates.len() - keep_count;
    for (_, path) in candidates.into_iter().take(remove_count) {
        // Re-check immediately before deletion in case the entry was replaced
        // by a symlink/reparse point while the directory was being scanned.
        let metadata = match fs::symlink_metadata(&path) {
            Ok(value) if !is_reparse_or_symlink(&value) && value.is_file() => value,
            _ => continue,
        };
        let _ = metadata;
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

pub fn read_attempts(profile: &ServerProfile) -> AppResult<Vec<LaunchAttempt>> {
    if !is_observed_profile(profile) {
        return Ok(Vec::new());
    }
    let directory = attempts_dir(Path::new(&profile.root_path))?;
    if !directory.is_dir() {
        return Ok(Vec::new());
    }
    let mut attempts = Vec::new();
    for entry in fs::read_dir(directory)?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let metadata = match fs::symlink_metadata(&path) {
            Ok(value)
                if !is_reparse_or_symlink(&value)
                    && value.is_file()
                    && value.len() <= MAX_ATTEMPT_BYTES as u64 =>
            {
                value
            }
            _ => continue,
        };
        let _ = metadata;
        let bytes = match fs::read(&path) {
            Ok(value) => value,
            Err(_) => continue,
        };
        // Avoid accepting a path that changed into a reparse entry between
        // the metadata check and the read.
        if fs::symlink_metadata(&path)
            .map(|value| is_reparse_or_symlink(&value))
            .unwrap_or(true)
        {
            continue;
        }
        let Ok(mut attempt) = serde_json::from_slice::<LaunchAttempt>(&bytes) else {
            continue;
        };
        if attempt.server_id != profile.id
            || attempt.schema_version != LAUNCH_ATTEMPT_SCHEMA_VERSION
        {
            continue;
        }
        // Older sidecars may have been written before the in-memory bound was
        // introduced.  Clamp on read without rewriting user files.
        attempt.log_evidence.truncate(MAX_LOG_EVIDENCE);
        attempt.warning_codes.truncate(MAX_WARNING_CODES);
        attempt
            .quarantine_candidates
            .truncate(MAX_QUARANTINE_CANDIDATES);
        for evidence in &mut attempt.log_evidence {
            evidence.message = redact_log_line(&evidence.message);
            evidence.timestamp = bounded_text(&evidence.timestamp, 64);
            evidence.level = bounded_text(&evidence.level, 32);
        }
        attempts.push(attempt);
    }
    attempts.sort_by(|left, right| {
        right
            .ended_at
            .as_deref()
            .unwrap_or(&right.started_at)
            .cmp(left.ended_at.as_deref().unwrap_or(&left.started_at))
    });
    attempts.truncate(MAX_LAUNCH_HISTORY);
    Ok(attempts)
}

pub fn latest_diagnosis(profile: &ServerProfile) -> AppResult<Option<DiagnosisIssue>> {
    let Some(attempt) = read_attempts(profile)?.into_iter().next() else {
        return Ok(None);
    };
    let recovered_legacy_probe = legacy_invalid_dist_probe_ready(&attempt);
    if attempt.state == "failed" && !recovered_legacy_probe {
        let code = attempt
            .fatal_code
            .clone()
            .unwrap_or_else(|| "loader-fatal".into());
        let candidates = attempt
            .quarantine_candidates
            .iter()
            .filter_map(|candidate| {
                candidate
                    .file_name
                    .as_deref()
                    .or(candidate.mod_id.as_deref())
            })
            .map(|value| value.to_string())
            .take(8)
            .collect::<Vec<_>>();
        let next = if candidates.is_empty() {
            vec![
                "サーバーを停止したまま、起動履歴の根拠ログとMod構成を確認してください。".into(),
                "候補の移動・削除・隔離は自動では行いません。バックアップ後に明示操作を選択してください。".into(),
            ]
        } else {
            vec![
                format!("候補（提案のみ）: {}", candidates.join(", ")),
                "候補ファイルやMod IDを確認し、必要ならバックアップ後に明示操作を選択してください。自動移動・削除・隔離は行いません。".into(),
            ]
        };
        return Ok(Some(DiagnosisIssue {
            id: format!("launch-attempt-{code}"),
            severity: "error".into(),
            what_happened: format!("Modローダーの起動検証に失敗しました（{code}）"),
            impact: "Ready markerへ到達しなかったため、サーバーを起動成功として扱っていません。".into(),
            likely_cause: "起動履歴の根拠ログに記録されたローダーエラー、Mod重複、依存関係、または専用サーバー非対応クラスを確認してください。".into(),
            next_actions: next,
            related_logs: attempt
                .log_evidence
                .iter()
                .filter(|entry| entry.level.eq_ignore_ascii_case("ERROR") || entry.message.contains("[PATH]"))
                .map(|entry| format!("{} {}", entry.level, entry.message))
                .take(8)
                .collect(),
            suggest_restore: false,
        }));
    }
    if recovered_legacy_probe {
        return Ok(Some(DiagnosisIssue {
            id: "launch-attempt-warning".into(),
            severity: "warning".into(),
            what_happened: "起動履歴にReady markerと終了コード0を確認しました。invalid distの行は起動失敗を示していません。".into(),
            impact: "この起動はReadyへ到達した後、終了コード0で終了しています。現在サーバーが起動中かはプロセス状態で確認してください。".into(),
            likely_cause: "以前の判定がMixinなどによる専用サーバー上のクラス探索ログを致命エラーとして扱っていました。".into(),
            next_actions: vec!["今後、このクラス探索ログは警告として扱います。サーバーを起動する場合は通常どおり開始してください。".into()],
            related_logs: attempt
                .log_evidence
                .iter()
                .filter(|entry| {
                    let lower = entry.message.to_ascii_lowercase();
                    is_invalid_dist_probe(&lower)
                        || is_ready_marker(&attempt.target.loader, &lower)
                })
                .map(|entry| format!("{} {}", entry.level, entry.message))
                .take(8)
                .collect(),
            suggest_restore: false,
        }));
    }
    if matches!(attempt.state.as_str(), "ready" | "exited") && !attempt.warning_codes.is_empty() {
        return Ok(Some(DiagnosisIssue {
            id: "launch-attempt-warning".into(),
            severity: "warning".into(),
            what_happened: format!("サーバーはReadyに到達しました。起動履歴にローダー警告があります: {}", attempt.warning_codes.join(", ")),
            impact: "サーバーは起動成功として扱っています。一部のMod読み込み検査やLoot Table、非推奨APIに関するログを確認してください。".into(),
            likely_cause: "起動履歴に記録された非致命警告を確認してください。".into(),
            next_actions: vec!["対応版のMod／プラグインを配布元で確認し、変更前にバックアップしてください。".into()],
            related_logs: attempt
                .log_evidence
                .iter()
                .filter(|entry| {
                    entry.level.eq_ignore_ascii_case("WARN")
                        || is_invalid_dist_probe(&entry.message.to_ascii_lowercase())
                })
                .map(|entry| format!("{} {}", entry.level, entry.message))
                .take(8)
                .collect(),
            suggest_restore: false,
        }));
    }
    Ok(None)
}

fn write_attempt_atomically(path: &Path, attempt: &LaunchAttempt) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::Validation("起動履歴の保存先が正しくありません".into()))?;
    reject_symlink(parent)?;
    reject_symlink(path)?;
    fs::create_dir_all(parent)?;
    let bytes = serde_json::to_vec_pretty(attempt)?;
    if bytes.len() > MAX_ATTEMPT_BYTES {
        return Err(AppError::Validation("起動履歴が上限を超えています".into()));
    }
    let temporary = parent.join(format!(".launch-attempt.tmp-{}", Uuid::new_v4()));
    let result = (|| -> AppResult<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        std::io::Write::write_all(&mut file, &bytes)?;
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
        Ok(metadata) if is_reparse_or_symlink(&metadata) => Err(AppError::Validation(format!(
            "起動履歴の保存先にシンボリックリンク／再解析ポイントは使用できません: {}",
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
        return metadata.file_attributes() & 0x400 != 0;
    }
    #[cfg(not(windows))]
    {
        false
    }
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
    use std::{fs, path::PathBuf};

    fn profile(root: &Path, loader: &str) -> ServerProfile {
        ServerProfile {
            id: format!("m5-{loader}"),
            name: "M5".into(),
            root_path: root.display().to_string(),
            game_kind: "minecraft".into(),
            server_type: loader.into(),
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

    fn temp_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("msh-m5-{label}-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn classifies_all_supported_loaders_ready_markers() {
        for loader in ["forge", "neoforge", "fabric", "quilt", "paper", "vanilla"] {
            assert_eq!(
                classify_loader_line(loader, "[Server thread/INFO]: Done (2.1s)! For help", false),
                LoaderObservation::Ready,
                "{loader} should recognize the vanilla ready marker"
            );
        }
        assert_eq!(
            classify_loader_line("paper", "Running Paper version 1.0", false),
            LoaderObservation::None
        );
        assert_eq!(
            classify_loader_line("fabric", "Server started", false),
            LoaderObservation::None
        );
        assert_eq!(
            classify_loader_line("paper", "Done (2.1s)! For help", false),
            LoaderObservation::Ready
        );
        assert_eq!(
            classify_loader_line("forge", "Ready for connections", false),
            LoaderObservation::None
        );
    }

    #[test]
    fn paper_banner_then_fatal_exit_does_not_commit_quarantine() {
        use std::io::{Cursor, Write};
        use zip::{ZipWriter, write::SimpleFileOptions};

        let root = temp_root("paper-banner-no-commit");
        let backups = temp_root("paper-banner-backups");
        let server = profile(&root, "paper");
        let mods = root.join("mods");
        fs::create_dir_all(&mods).unwrap();
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        writer
            .start_file("META-INF/mods.toml", SimpleFileOptions::default())
            .unwrap();
        write!(
            writer,
            "[[mods]]\nmodId = \"example\"\nversion = \"1.0.0\"\n"
        )
        .unwrap();
        fs::write(
            mods.join("client-only.jar"),
            writer.finish().unwrap().into_inner(),
        )
        .unwrap();

        let candidate = quarantine::list(&server).unwrap().candidates.remove(0);
        let operation = quarantine::apply(
            &server,
            &backups,
            vec![quarantine::QuarantineSelection {
                relative_path: candidate.relative_path,
                sha256: candidate.sha256,
            }],
            quarantine::APPLY_CONFIRMATION,
        )
        .unwrap();
        assert_eq!(operation.status, "awaiting-launch-validation");

        let observer = LaunchObserver::begin(&server).unwrap().unwrap();
        observer.observe_line("INFO", "Running Paper version 1.0");
        assert_eq!(read_attempts(&server).unwrap()[0].state, "starting");
        assert_eq!(
            quarantine::list(&server).unwrap().operations[0].status,
            "awaiting-launch-validation"
        );

        observer.observe_line("ERROR", "ModLoadingException: failed after Paper banner");
        observer.mark_exit_code(Some(1));
        assert_eq!(read_attempts(&server).unwrap()[0].state, "failed");
        let after_failure = quarantine::list(&server).unwrap().operations.remove(0);
        assert_eq!(after_failure.status, "needs-recovery");
        assert_ne!(after_failure.status, "committed");

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(backups).unwrap();
    }

    #[test]
    fn detects_fatal_loader_errors_and_candidates_but_not_bare_error() {
        assert_eq!(
            classify_loader_line("forge", "ModLoadingException: duplicate mods", false),
            LoaderObservation::Fatal("mod-loading-exception")
        );
        assert_eq!(
            classify_loader_line(
                "forge",
                "Duplicate mod ID example in mods/example.jar",
                false
            ),
            LoaderObservation::Fatal("duplicate-mod")
        );
        assert_eq!(
            classify_loader_line(
                "forge",
                "Missing required dependency example in example.jar",
                false
            ),
            LoaderObservation::Fatal("missing-dependency")
        );
        assert_eq!(
            classify_loader_line("forge", "[ERROR] a recoverable plugin message", false),
            LoaderObservation::None
        );
    }

    #[test]
    fn ready_then_loot_table_and_deprecation_warnings_remain_nonfatal() {
        assert_eq!(
            classify_loader_line(
                "forge",
                "[Server thread/INFO]: Done (2.1s)! For help",
                false
            ),
            LoaderObservation::Ready
        );
        assert_eq!(
            classify_loader_line(
                "forge",
                "[Server thread/WARN]: Iron's Spellbooks loot table missing name",
                true
            ),
            LoaderObservation::Warning("loot-table-warning")
        );
        assert_eq!(
            classify_loader_line("paper", "[Server thread/WARN]: Deprecated API used", true),
            LoaderObservation::Warning("deprecated-api")
        );
    }

    #[test]
    fn invalid_dist_mixin_probes_before_and_after_ready_are_non_fatal() {
        let root = temp_root("invalid-dist-probe-ready");
        let server = profile(&root, "neoforge");
        let observer = LaunchObserver::begin(&server).unwrap().unwrap();
        let probe = "[mixin/ERROR]: Error loading class net/minecraft/client/gui/screens/Screen (java.lang.RuntimeException: Attempted to load class net/minecraft/client/gui/screens/Screen for invalid dist DEDICATED_SERVER)";

        assert_eq!(
            classify_loader_line("neoforge", probe, false),
            LoaderObservation::Warning("invalid-dist-probe")
        );
        observer.observe_line("ERROR", probe);
        assert!(!observer.is_failed());
        assert!(!observer.take_safe_stop_request());

        observer.observe_line("INFO", "Done (10.452s)! For help");
        assert!(observer.is_ready());
        observer.observe_line("ERROR", probe);
        assert!(observer.is_ready());
        assert!(!observer.is_failed());
        assert!(!observer.take_safe_stop_request());

        observer.mark_exit_code(Some(0));
        let attempt = read_attempts(&server).unwrap().remove(0);
        assert_eq!(attempt.state, "exited");
        assert_eq!(attempt.exit_code, Some(0));
        assert!(attempt.ready_at.is_some());
        assert_eq!(attempt.fatal_code, None);
        assert!(
            attempt
                .warning_codes
                .iter()
                .any(|value| value == "invalid-dist-probe")
        );
        let diagnosis = latest_diagnosis(&server).unwrap().unwrap();
        assert_eq!(diagnosis.id, "launch-attempt-warning");
        assert_eq!(diagnosis.severity, "warning");
        assert!(
            diagnosis
                .related_logs
                .iter()
                .any(|line| line.contains("invalid dist DEDICATED_SERVER"))
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn legacy_invalid_dist_failure_with_ready_and_clean_exit_is_diagnosed_as_warning() {
        let root = temp_root("legacy-invalid-dist-ready");
        let server = profile(&root, "neoforge");
        let observer = LaunchObserver::begin(&server).unwrap().unwrap();
        observer.observe_line(
            "ERROR",
            "[mixin/ERROR]: Attempted to load class net/minecraft/client/gui/screens/Screen for invalid dist DEDICATED_SERVER",
        );
        observer.observe_line("INFO", "Done (10.452s)! For help");
        observer.mark_exit_code(Some(0));

        let mut legacy_attempt = read_attempts(&server).unwrap().remove(0);
        legacy_attempt.state = "failed".into();
        legacy_attempt.ready_at = None;
        legacy_attempt.fatal_code = Some("invalid-dist-client-only".into());
        legacy_attempt.warning_codes.clear();
        let path = attempts_dir(&root)
            .unwrap()
            .join(format!("{}.json", legacy_attempt.attempt_id));
        write_attempt_atomically(&path, &legacy_attempt).unwrap();

        let diagnosis = latest_diagnosis(&server).unwrap().unwrap();
        assert_eq!(diagnosis.id, "launch-attempt-warning");
        assert_eq!(diagnosis.severity, "warning");
        assert!(diagnosis.what_happened.contains("終了コード0"));
        assert!(
            diagnosis
                .related_logs
                .iter()
                .any(|line| line.contains("Done (10.452s)!"))
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_dist_probe_followed_by_nonzero_exit_before_ready_remains_a_failure() {
        let root = temp_root("invalid-dist-probe-exit");
        let server = profile(&root, "neoforge");
        let observer = LaunchObserver::begin(&server).unwrap().unwrap();
        observer.observe_line(
            "ERROR",
            "Attempted to load class net/minecraft/client/gui/screens/Screen for invalid dist DEDICATED_SERVER",
        );
        assert!(!observer.is_failed());
        assert!(!observer.take_safe_stop_request());

        observer.mark_exit_code(Some(1));
        let attempt = read_attempts(&server).unwrap().remove(0);
        assert_eq!(attempt.state, "failed");
        assert_eq!(attempt.fatal_code.as_deref(), Some("non-zero-before-ready"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_dist_warning_does_not_hide_a_real_mod_loading_failure_after_ready() {
        let root = temp_root("invalid-dist-before-real-failure");
        let server = profile(&root, "neoforge");
        let observer = LaunchObserver::begin(&server).unwrap().unwrap();
        observer.observe_line(
            "ERROR",
            "Attempted to load class net/minecraft/client/gui/screens/Screen for invalid dist DEDICATED_SERVER",
        );
        observer.observe_line("INFO", "Done (10.452s)! For help");
        observer.observe_line("ERROR", "ModLoadingException: a real loader failure");
        assert!(observer.is_failed());
        assert!(observer.take_safe_stop_request());
        observer.mark_exit_code(Some(1));
        let attempt = read_attempts(&server).unwrap().remove(0);
        assert_eq!(attempt.state, "failed");
        assert_eq!(attempt.fatal_code.as_deref(), Some("mod-loading-exception"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn attempt_is_bounded_and_redacted_and_updates_state_only_on_ready() {
        let root = temp_root("history");
        let server = profile(&root, "forge");
        let observer = LaunchObserver::begin(&server).unwrap().unwrap();
        observer.observe_line(
            "ERROR",
            r"token=abc123 192.168.0.4 C:\\Users\\Alice\\Servers\\mods\\bad.jar",
        );
        observer.observe_line(
            "ERROR",
            "Failed to create mod instance. ModID: badmod in bad.jar",
        );
        let attempts = read_attempts(&server).unwrap();
        assert_eq!(attempts.len(), 1);
        assert_eq!(attempts[0].state, "failed");
        let evidence = serde_json::to_string(&attempts[0]).unwrap();
        assert!(!evidence.contains("abc123"));
        assert!(!evidence.contains("192.168.0.4"));
        assert!(!evidence.contains("C:\\\\Users"));
        assert!(attempts[0].log_evidence.len() <= MAX_LOG_EVIDENCE);
        assert!(
            attempts[0]
                .quarantine_candidates
                .iter()
                .any(|item| item.mod_id.as_deref() == Some("badmod"))
        );
        observer.mark_exit_code(Some(1));
        assert_eq!(read_attempts(&server).unwrap()[0].state, "failed");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn ready_success_persists_and_exit_is_distinct() {
        let root = temp_root("ready");
        let server = profile(&root, "fabric");
        let observer = LaunchObserver::begin(&server).unwrap().unwrap();
        observer.observe_line("INFO", "Done (1s)! For help");
        observer.observe_line("WARN", "Loot table warning");
        let mut state = None;
        for _ in 0..20 {
            state = mod_management::read(&server).unwrap();
            if state
                .as_ref()
                .and_then(|value| value.last_successful_launch.as_ref())
                .is_some()
            {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        assert!(
            state
                .as_ref()
                .and_then(|value| value.last_successful_launch.as_ref())
                .is_some()
        );
        let ready = read_attempts(&server).unwrap().remove(0);
        assert_eq!(ready.state, "ready");
        assert!(ready.ready_at.is_some());
        assert_eq!(ready.fatal_code, None);
        observer.mark_exit_code(Some(0));
        assert_eq!(read_attempts(&server).unwrap()[0].state, "exited");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn ordinary_evidence_is_throttled_and_final_exit_flushes_latest_snapshot() {
        let root = temp_root("throttle");
        let server = profile(&root, "forge");
        let observer = LaunchObserver::begin(&server).unwrap().unwrap();
        let initial_writes = observer.persisted_write_count();
        for index in 0..400 {
            observer.observe_line("INFO", &format!("ordinary evidence line {index}"));
        }
        let writes_before_exit = observer.persisted_write_count();
        assert!(
            writes_before_exit.saturating_sub(initial_writes) <= 4,
            "ordinary log lines must not cause one write each: {writes_before_exit}"
        );
        observer.mark_exit_code(Some(0));
        let attempt = read_attempts(&server).unwrap().remove(0);
        assert_eq!(attempt.state, "failed");
        assert_eq!(attempt.fatal_code.as_deref(), Some("exited-before-ready"));
        assert!(attempt.log_evidence.len() <= MAX_LOG_EVIDENCE);
        assert!(
            attempt
                .log_evidence
                .iter()
                .any(|entry| entry.message.contains("ordinary evidence line 399"))
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn history_is_pruned_to_fifty_records_when_new_attempts_are_created() {
        let root = temp_root("retention");
        let server = profile(&root, "forge");
        for _ in 0..(MAX_LAUNCH_HISTORY + 7) {
            let observer = LaunchObserver::begin(&server).unwrap().unwrap();
            observer.mark_exit_code(Some(1));
        }
        let attempts = read_attempts(&server).unwrap();
        assert_eq!(attempts.len(), MAX_LAUNCH_HISTORY);
        let directory = attempts_dir(&root).unwrap();
        let regular_json_count = fs::read_dir(directory)
            .unwrap()
            .flatten()
            .filter_map(|entry| {
                let path = entry.path();
                let metadata = fs::symlink_metadata(&path).ok()?;
                (path.extension().and_then(|value| value.to_str()) == Some("json")
                    && !is_reparse_or_symlink(&metadata)
                    && metadata.is_file())
                .then_some(())
            })
            .count();
        assert!(regular_json_count <= MAX_LAUNCH_HISTORY);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn deterministic_fatal_requests_one_safe_stop_and_bedrock_palworld_are_unobserved() {
        let root = temp_root("fatal-stop");
        let server = profile(&root, "forge");
        let observer = LaunchObserver::begin(&server).unwrap().unwrap();
        observer.observe_line(
            "ERROR",
            "ModLoadingException: duplicate mod in broken.jar ModID: brokenmod",
        );
        assert!(observer.is_failed());
        let writes_after_first_fatal = observer.persisted_write_count();
        for _ in 0..100 {
            observer.observe_line("ERROR", "ModLoadingException: duplicate mod in broken.jar");
        }
        assert!(
            observer
                .persisted_write_count()
                .saturating_sub(writes_after_first_fatal)
                <= 2,
            "repeated fatal evidence must not synchronously rewrite every log line"
        );
        assert!(observer.take_safe_stop_request());
        assert!(!observer.take_safe_stop_request());
        observer.mark_exit_code(Some(1));

        let mut bedrock = profile(&root, "bedrock");
        bedrock.server_type = "bedrock".into();
        assert!(LaunchObserver::begin(&bedrock).unwrap().is_none());
        let mut palworld = profile(&root, "palworld");
        palworld.game_kind = "palworld".into();
        palworld.server_type = "palworld".into();
        assert!(LaunchObserver::begin(&palworld).unwrap().is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn warning_diagnosis_survives_clean_exit_after_ready() {
        let root = temp_root("warning-diagnosis");
        let server = profile(&root, "fabric");
        let observer = LaunchObserver::begin(&server).unwrap().unwrap();
        observer.observe_line("INFO", "Done (1s)! For help");
        observer.observe_line("WARN", "Loot table warning: missing name");
        assert!(!observer.is_failed());
        observer.mark_exit_code(Some(0));
        let attempt = read_attempts(&server).unwrap().remove(0);
        assert_eq!(attempt.state, "exited");
        assert!(
            attempt
                .warning_codes
                .iter()
                .any(|value| value == "loot-table-warning")
        );
        let diagnosis = latest_diagnosis(&server).unwrap().unwrap();
        assert_eq!(diagnosis.id, "launch-attempt-warning");
        assert_eq!(diagnosis.severity, "warning");
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn history_read_skips_symlink_entries_without_following_them() {
        use std::os::unix::fs::symlink;

        let root = temp_root("symlink");
        let server = profile(&root, "forge");
        let observer = LaunchObserver::begin(&server).unwrap().unwrap();
        observer.mark_exit_code(Some(1));
        let directory = attempts_dir(&root).unwrap();
        let target = root.join("outside.json");
        fs::write(&target, b"not a launch attempt").unwrap();
        symlink(&target, directory.join("external.json")).unwrap();
        assert_eq!(read_attempts(&server).unwrap().len(), 1);
        assert_eq!(fs::read(&target).unwrap(), b"not a launch attempt");
        fs::remove_dir_all(root).unwrap();
    }
}
