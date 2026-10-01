//! Native secrets and a bounded volatile queue: no replay after restart.
use crate::{
    AppState,
    error::{AppError, AppResult},
    membership,
    models::ServerProfile,
    secure_secrets,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{Manager, State};

const SERVICE: &str = "TomoNode Discord Notifications";
const QUEUE_LIMIT: usize = 32;
#[derive(Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Events {
    pub started: bool,
    pub stopped: bool,
    pub crashed: bool,
}
impl Events {
    fn contains(&self, event: &str) -> bool {
        match event {
            "started" => self.started,
            "stopped" => self.stopped,
            "crashed" => self.crashed,
            "test" => true,
            _ => false,
        }
    }
}
#[derive(Clone, Deserialize, Serialize)]
struct Config {
    url: String,
    enabled: bool,
    events: Events,
    generation: String,
    #[serde(default)]
    session_binding: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub registered: bool,
    pub enabled: bool,
    pub events: Events,
    pub destination_id: Option<String>,
    pub last_result: String,
}
#[derive(Default)]
struct Lifecycle {
    state: String,
    expected_stop: bool,
}
struct Job {
    server_id: String,
    name: String,
    event: String,
    generation: String,
    at: String,
    queued: Instant,
}
#[derive(Default)]
pub struct DiscordService {
    configurations: Mutex<HashMap<String, Config>>,
    lifecycle: Mutex<HashMap<String, Lifecycle>>,
    results: Mutex<HashMap<String, String>>,
    queue: Mutex<VecDeque<Job>>,
    recent: Mutex<HashMap<String, (String, Instant)>>,
    wake: tokio::sync::Notify,
    pub dispatch_lock: tokio::sync::Mutex<()>,
}
fn validation() -> AppError {
    AppError::Validation("Discordの正式なHTTPS Incoming Webhook URLを入力してください".into())
}
pub fn validate_url(value: &str) -> AppResult<String> {
    let url = reqwest::Url::parse(value.trim()).map_err(|_| validation())?;
    if url.scheme() != "https"
        || url.host_str() != Some("discord.com")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some_and(|p| p != 443)
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(validation());
    }
    let pattern =
        regex::Regex::new(r"^/api/(?:v10/)?webhooks/[0-9]{15,22}/[A-Za-z0-9_-]{30,200}$").unwrap();
    if !pattern.is_match(url.path()) {
        return Err(validation());
    }
    Ok(url.to_string())
}
impl DiscordService {
    fn config(&self, id: &str) -> AppResult<Option<Config>> {
        if let Some(value) = self.configurations.lock().unwrap().get(id).cloned() {
            return Ok(Some(value));
        }
        let value = secure_secrets::read(SERVICE, id)?
            .and_then(|value| serde_json::from_str::<Config>(&value).ok());
        if let Some(ref value) = value {
            self.configurations
                .lock()
                .unwrap()
                .insert(id.into(), value.clone());
        }
        Ok(value)
    }
    fn save(&self, id: &str, config: Config) -> AppResult<()> {
        secure_secrets::write(SERVICE, id, &serde_json::to_string(&config)?)?;
        self.configurations
            .lock()
            .unwrap()
            .insert(id.into(), config);
        self.queue.lock().unwrap().retain(|job| job.server_id != id);
        self.recent.lock().unwrap().remove(id);
        Ok(())
    }
    pub fn view(&self, id: &str) -> AppResult<View> {
        let config = self.config(id)?;
        Ok(View {
            registered: config.is_some(),
            enabled: config.as_ref().is_some_and(|c| c.enabled),
            events: config
                .as_ref()
                .map_or_else(Events::default, |c| c.events.clone()),
            destination_id: config.map(|c| c.generation),
            last_result: self
                .results
                .lock()
                .unwrap()
                .get(id)
                .cloned()
                .unwrap_or_else(|| "not_sent".into()),
        })
    }
    pub fn disable(&self, id: &str) -> AppResult<()> {
        if let Some(mut config) = self.config(id)? {
            config.enabled = false;
            config.generation = uuid::Uuid::new_v4().to_string();
            self.save(id, config)?;
        }
        self.queue.lock().unwrap().retain(|job| job.server_id != id);
        Ok(())
    }
    pub fn spawned(&self, id: &str) {
        self.lifecycle.lock().unwrap().insert(
            id.into(),
            Lifecycle {
                state: "starting".into(),
                expected_stop: false,
            },
        );
    }
    pub fn stopping(&self, id: &str) {
        if let Some(value) = self.lifecycle.lock().unwrap().get_mut(id) {
            value.expected_stop = true;
        }
    }
    pub fn stop_failed(&self, id: &str) {
        if let Some(value) = self.lifecycle.lock().unwrap().get_mut(id) {
            value.expected_stop = false;
        }
    }
    pub fn observe(&self, profile: &ServerProfile, state: &str) {
        let event = {
            let mut states = self.lifecycle.lock().unwrap();
            let Some(previous) = states.get_mut(&profile.id) else {
                states.insert(
                    profile.id.clone(),
                    Lifecycle {
                        state: state.into(),
                        expected_stop: false,
                    },
                );
                return;
            };
            let event = transition(&previous.state, state, previous.expected_stop);
            previous.state = state.into();
            if matches!(state, "stopped" | "crashed") {
                previous.expected_stop = false;
            }
            event
        };
        if let Some(event) = event {
            let _ = self.enqueue(profile, event);
        }
    }
    fn enqueue(&self, profile: &ServerProfile, event: &str) -> AppResult<()> {
        let Some(config) = self.config(&profile.id)? else {
            return Ok(());
        };
        if !config.enabled || !config.events.contains(event) {
            return Ok(());
        }
        let mut recent = self.recent.lock().unwrap();
        if recent.get(&profile.id).is_some_and(|(previous, at)| {
            previous == event && at.elapsed() < Duration::from_secs(10)
        }) {
            return Ok(());
        }
        recent.insert(profile.id.clone(), (event.into(), Instant::now()));
        drop(recent);
        let mut queue = self.queue.lock().unwrap();
        if queue.len() >= QUEUE_LIMIT {
            self.results
                .lock()
                .unwrap()
                .insert(profile.id.clone(), "queue_full".into());
            return Ok(());
        }
        queue.push_back(Job {
            server_id: profile.id.clone(),
            name: profile.name.chars().take(64).collect(),
            event: event.into(),
            generation: config.generation,
            at: chrono::Utc::now().to_rfc3339(),
            queued: Instant::now(),
        });
        drop(queue);
        self.wake.notify_one();
        Ok(())
    }
    pub fn start_worker(app: tauri::AppHandle) {
        tauri::async_runtime::spawn(async move {
            let Ok(client) = reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(8))
                .build()
            else {
                return;
            };
            loop {
                let state = app.state::<AppState>();
                // Also revoke idle configurations. A renewed subscription never
                // silently re-enables an old destination or replays old events.
                let qualification = state.membership.view(&state.client, false).await;
                let binding = current_binding();
                let ids: Vec<String> = state
                    .store
                    .lock()
                    .unwrap()
                    .list_servers()
                    .unwrap_or_default()
                    .into_iter()
                    .map(|p| p.id)
                    .collect();
                for id in ids {
                    if let Ok(Some(config)) = state.discord.config(&id) {
                        if config.enabled
                            && (!qualification.as_ref().is_ok_and(|v| v.supporter())
                                || config.session_binding != binding)
                        {
                            let _dispatch = state.discord.dispatch_lock.lock().await;
                            let _ = state.discord.disable(&id);
                        }
                    }
                }
                let job = state.discord.queue.lock().unwrap().pop_front();
                let Some(job) = job else {
                    let _ = tokio::time::timeout(
                        Duration::from_secs(20),
                        state.discord.wake.notified(),
                    )
                    .await;
                    continue;
                };
                let result = deliver(|| async {
                    if job.queued.elapsed() > Duration::from_secs(120) {
                        return Delivery::Failure("expired");
                    }
                    let _dispatch = state.discord.dispatch_lock.lock().await;
                    if membership::require_supporter(&state).await.is_err() {
                        let _ = state.discord.disable(&job.server_id);
                        return Delivery::Failure("qualification_required");
                    }
                    if state
                        .store
                        .lock()
                        .unwrap()
                        .get_server(&job.server_id)
                        .is_err()
                    {
                        return Delivery::Failure("cancelled");
                    }
                    let Ok(Some(config)) = state.discord.config(&job.server_id) else {
                        return Delivery::Failure("cancelled");
                    };
                    if !config.enabled
                        || config.session_binding != current_binding()
                        || config.generation != job.generation
                        || !config.events.contains(&job.event)
                    {
                        return Delivery::Failure("cancelled");
                    }
                    if validate_url(&config.url).is_err() {
                        return Delivery::Failure("delivery_failed");
                    }
                    let Ok(mut url) = reqwest::Url::parse(&config.url) else {
                        return Delivery::Failure("delivery_failed");
                    };
                    url.query_pairs_mut().append_pair("wait", "true");
                    match client
                        .post(url)
                        .json(&payload(&job.name, &job.event, &job.at))
                        .send()
                        .await
                    {
                        Ok(response) if response.status().is_success() => Delivery::Sent,
                        Ok(response) if response.status().as_u16() == 429 => {
                            let retry = crate::secure_secrets::bounded_json::<serde_json::Value>(
                                response, 4096,
                            )
                            .await
                            .ok()
                            .and_then(|v| v["retry_after"].as_f64())
                            .unwrap_or(31.0);
                            Delivery::Retry(retry)
                        }
                        Ok(_) => Delivery::Failure("delivery_failed"),
                        Err(_) => Delivery::Failure("network_failed"),
                    }
                })
                .await;
                state
                    .discord
                    .results
                    .lock()
                    .unwrap()
                    .insert(job.server_id, result.into());
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        });
    }
}
enum Delivery {
    Sent,
    Retry(f64),
    Failure(&'static str),
}
// Injected transport in tests; production closure performs native authorization
// and secret lookup on every attempt. Never retry an ambiguous network failure.
async fn deliver<F, Fut>(mut send: F) -> &'static str
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Delivery>,
{
    for attempt in 0..3 {
        match send().await {
            Delivery::Sent => return "sent",
            Delivery::Failure(reason) => return reason,
            Delivery::Retry(delay)
                if attempt < 2 && delay.is_finite() && (0.0..=30.0).contains(&delay) =>
            {
                tokio::time::sleep(Duration::from_secs_f64(delay.max(1.0))).await;
            }
            Delivery::Retry(_) => return "rate_limited",
        }
    }
    "rate_limited"
}
fn current_binding() -> Option<String> {
    use sha2::{Digest, Sha256};
    crate::account_auth::membership_session_token()
        .ok()
        .flatten()
        .map(|token| hex::encode(Sha256::digest(token.as_bytes())))
}
pub fn transition(previous: &str, current: &str, expected_stop: bool) -> Option<&'static str> {
    if previous == current {
        return None;
    }
    if previous == "starting" && current == "running" {
        return Some("started");
    }
    if matches!(previous, "starting" | "running" | "stopping")
        && matches!(current, "stopped" | "crashed")
    {
        return Some(if expected_stop && current == "stopped" {
            "stopped"
        } else {
            "crashed"
        });
    }
    None
}
fn payload(name: &str, event: &str, at: &str) -> serde_json::Value {
    let label = match event {
        "started" => "起動完了",
        "stopped" => "停止完了",
        "crashed" => "異常終了・サーバー診断を確認してください",
        _ => "テスト通知（サーバーの状態は変更しません）",
    };
    serde_json::json!({"content": format!("TomoNode｜{name}\n{label}\n発生時刻：{at}"), "allowed_mentions":{"parse":[],"users":[],"roles":[],"replied_user":false},"tts":false})
}
#[tauri::command]
pub fn discord_notification_status(
    server_id: String,
    state: State<'_, AppState>,
) -> AppResult<View> {
    state.store.lock().unwrap().get_server(&server_id)?;
    state.discord.view(&server_id)
}
#[tauri::command]
pub async fn discord_save_destination(
    server_id: String,
    webhook_url: String,
    state: State<'_, AppState>,
) -> AppResult<View> {
    membership::require_supporter(&state).await?;
    state.store.lock().unwrap().get_server(&server_id)?;
    let _dispatch = state.discord.dispatch_lock.lock().await;
    state.discord.save(
        &server_id,
        Config {
            url: validate_url(&webhook_url)?,
            enabled: false,
            events: Events {
                started: true,
                stopped: true,
                crashed: true,
            },
            generation: uuid::Uuid::new_v4().to_string(),
            session_binding: current_binding(),
        },
    )?;
    state.discord.view(&server_id)
}
#[tauri::command]
pub async fn discord_set_notifications(
    server_id: String,
    enabled: bool,
    events: Events,
    state: State<'_, AppState>,
) -> AppResult<View> {
    if enabled {
        membership::require_supporter(&state).await?;
    }
    state.store.lock().unwrap().get_server(&server_id)?;
    let _dispatch = state.discord.dispatch_lock.lock().await;
    let mut config = state
        .discord
        .config(&server_id)?
        .ok_or_else(|| AppError::Validation("先に通知先を登録してください".into()))?;
    config.enabled = enabled;
    config.events = events;
    config.generation = uuid::Uuid::new_v4().to_string();
    config.session_binding = current_binding();
    state.discord.save(&server_id, config)?;
    state.discord.view(&server_id)
}
#[tauri::command]
pub async fn discord_delete_destination(
    server_id: String,
    state: State<'_, AppState>,
) -> AppResult<View> {
    let _dispatch = state.discord.dispatch_lock.lock().await;
    secure_secrets::delete(SERVICE, &server_id)?;
    state
        .discord
        .configurations
        .lock()
        .unwrap()
        .remove(&server_id);
    state
        .discord
        .queue
        .lock()
        .unwrap()
        .retain(|job| job.server_id != server_id);
    state.discord.view(&server_id)
}
#[tauri::command]
pub async fn discord_test_notification(
    server_id: String,
    confirmed: bool,
    state: State<'_, AppState>,
) -> AppResult<View> {
    if !confirmed {
        return Err(AppError::Validation(
            "送信先とテスト通知の内容を確認してください".into(),
        ));
    }
    membership::require_supporter(&state).await?;
    let profile = state.store.lock().unwrap().get_server(&server_id)?;
    if !state.discord.view(&server_id)?.enabled {
        return Err(AppError::Validation(
            "通知を明示的に有効化してください".into(),
        ));
    }
    state.discord.enqueue(&profile, "test")?;
    state
        .discord
        .results
        .lock()
        .unwrap()
        .insert(server_id.clone(), "queued".into());
    state.discord.view(&server_id)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_queue_coalesces_duplicates_and_clears_jobs_on_replace_or_disable() {
        let service = DiscordService::default();
        let profile = ServerProfile {
            id: "queue-test".into(),
            name: "Test".into(),
            root_path: "private-local-path".into(),
            game_kind: "minecraft".into(),
            server_type: "paper".into(),
            minecraft_version: "1.21.11".into(),
            distribution_build: None,
            launch_target: "server.jar".into(),
            java_path: "java".into(),
            java_major: 21,
            min_memory_mib: 1024,
            max_memory_mib: 4096,
            port: 25565,
            eula_accepted_at: "test".into(),
            pending_restart: false,
            settings: crate::models::BasicSettings::default(),
            palworld_settings: None,
            created_at: "test".into(),
            updated_at: "test".into(),
        };
        let config = Config {
            url: "test-only-secret".into(),
            enabled: true,
            events: Events {
                started: true,
                stopped: true,
                crashed: true,
            },
            generation: "first".into(),
            session_binding: None,
        };
        service.save(&profile.id, config.clone()).unwrap();
        service.enqueue(&profile, "started").unwrap();
        service.enqueue(&profile, "started").unwrap();
        assert_eq!(service.queue.lock().unwrap().len(), 1);
        for n in 0..100 {
            service
                .enqueue(&profile, if n % 2 == 0 { "stopped" } else { "started" })
                .unwrap();
        }
        assert_eq!(service.queue.lock().unwrap().len(), QUEUE_LIMIT);
        assert_eq!(service.view(&profile.id).unwrap().last_result, "queue_full");
        let mut replacement = config;
        replacement.generation = "new".into();
        replacement.enabled = false;
        service.save(&profile.id, replacement).unwrap();
        assert!(service.queue.lock().unwrap().is_empty());
        service.enqueue(&profile, "crashed").unwrap();
        assert!(service.queue.lock().unwrap().is_empty());
        service.disable(&profile.id).unwrap();
        assert!(!service.view(&profile.id).unwrap().enabled);
        secure_secrets::delete(SERVICE, &profile.id).unwrap();
    }
    #[tokio::test]
    async fn mock_transport_limits_retries_and_rechecks_cancelled_delivery() {
        let mut attempts = 0;
        let result = deliver(|| {
            attempts += 1;
            std::future::ready(Delivery::Retry(0.0))
        })
        .await;
        assert_eq!(result, "rate_limited");
        assert_eq!(attempts, 3);
        let mut attempts = 0;
        let result = deliver(|| {
            attempts += 1;
            std::future::ready(if attempts == 1 {
                Delivery::Retry(0.0)
            } else {
                Delivery::Failure("cancelled")
            })
        })
        .await;
        assert_eq!(result, "cancelled");
        assert_eq!(attempts, 2);
        let mut attempts = 0;
        let result = deliver(|| {
            attempts += 1;
            std::future::ready(Delivery::Failure("network_failed"))
        })
        .await;
        assert_eq!(result, "network_failed");
        assert_eq!(attempts, 1);
        assert_eq!(deliver(|| std::future::ready(Delivery::Sent)).await, "sent");
        assert_eq!(
            deliver(|| std::future::ready(Delivery::Retry(31.0))).await,
            "rate_limited"
        );
    }
    #[test]
    fn accepts_only_official_exact_host_and_path_without_query() {
        let path = "/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCD";
        assert!(validate_url(&format!("https://discord.com{path}")).is_ok());
        for host in [
            "http://discord.com",
            "https://discord.com.evil.test",
            "https://127.0.0.1",
            "https://10.0.0.1",
            "https://user@discord.com",
            "https://discord.com:8443",
        ] {
            assert!(validate_url(&format!("{host}{path}")).is_err());
        }
        for suffix in ["?wait=true", "#secret", "/extra"] {
            assert!(validate_url(&format!("https://discord.com{path}{suffix}")).is_err());
        }
    }
    #[test]
    fn lifecycle_does_not_treat_spawn_or_restore_as_ready() {
        assert_eq!(transition("stopped", "starting", false), None);
        assert_eq!(transition("stopped", "running", false), None);
        assert_eq!(transition("starting", "running", false), Some("started"));
        assert_eq!(transition("running", "running", false), None);
        assert_eq!(transition("running", "stopped", true), Some("stopped"));
        assert_eq!(transition("running", "stopped", false), Some("crashed"));
        let service = DiscordService::default();
        service.spawned("failed-stop");
        service.stopping("failed-stop");
        assert!(service.lifecycle.lock().unwrap()["failed-stop"].expected_stop);
        // A failed save/shutdown must not bless a later unexpected exit.
        service.stop_failed("failed-stop");
        let states = service.lifecycle.lock().unwrap();
        let state = &states["failed-stop"];
        assert_eq!(
            transition(&state.state, "stopped", state.expected_stop),
            Some("crashed")
        );
    }
    #[test]
    fn messages_disable_mentions_and_omit_runtime_private_fields() {
        let value = payload("@everyone @here", "started", "2026-09-30T00:00:00Z");
        assert_eq!(value["allowed_mentions"]["parse"], serde_json::json!([]));
        assert!(!value.to_string().contains("rootPath"));
    }
    #[test]
    fn secret_url_never_returns_to_ui_and_disable_invalidates_generation() {
        let service = DiscordService::default();
        service
            .save(
                "discord-test",
                Config {
                    url: "secret-url".into(),
                    enabled: true,
                    events: Events::default(),
                    generation: "old".into(),
                    session_binding: None,
                },
            )
            .unwrap();
        assert!(
            !serde_json::to_string(&service.view("discord-test").unwrap())
                .unwrap()
                .contains("secret-url")
        );
        service.disable("discord-test").unwrap();
        let view = service.view("discord-test").unwrap();
        assert!(!view.enabled);
        assert_ne!(view.destination_id.as_deref(), Some("old"));
        secure_secrets::delete(SERVICE, "discord-test").unwrap();
    }
}
