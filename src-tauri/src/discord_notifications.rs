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
#[derive(Clone, Deserialize, Serialize, Default, PartialEq, Eq)]
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
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MentionMode {
    Role,
    Here,
    Everyone,
}
#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MentionSettings {
    pub enabled: bool,
    pub mode: MentionMode,
    pub role_id: String,
}
impl Default for MentionSettings {
    // Legacy saved configurations must never acquire a broad mention merely
    // because they predate mention settings.
    fn default() -> Self {
        Self {
            enabled: false,
            mode: MentionMode::Everyone,
            role_id: String::new(),
        }
    }
}
const SUPPORTED_LOCALES: [&str; 9] = [
    "en", "ja", "zh-CN", "zh-TW", "ko", "es", "de", "fr", "pt-BR",
];
struct ActiveLocale {
    locale: String,
    generation: String,
    ready: bool,
}
impl Default for ActiveLocale {
    fn default() -> Self {
        Self {
            locale: "ja".into(),
            generation: "uninitialized".into(),
            ready: false,
        }
    }
}
impl MentionSettings {
    fn new_destination() -> Self {
        Self {
            enabled: true,
            mode: MentionMode::Everyone,
            role_id: String::new(),
        }
    }
    fn validate(&self, require_target: bool) -> AppResult<()> {
        let role_id = self.role_id.trim();
        if !role_id.is_empty()
            && (role_id.len() < 17
                || role_id.len() > 22
                || !role_id.bytes().all(|value| value.is_ascii_digit()))
        {
            return Err(AppError::Validation("discord.error.role_id_invalid".into()));
        }
        if require_target && self.enabled && self.mode == MentionMode::Role && role_id.is_empty() {
            return Err(AppError::Validation(
                "discord.error.role_id_required".into(),
            ));
        }
        Ok(())
    }
}
#[derive(Clone, Deserialize, Serialize)]
struct Config {
    url: String,
    enabled: bool,
    events: Events,
    #[serde(default)]
    mentions: MentionSettings,
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
    pub mentions: MentionSettings,
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
    locale: String,
    locale_generation: String,
    at: String,
    queued: Instant,
}
#[derive(Default)]
pub struct DiscordService {
    configurations: Mutex<HashMap<String, Config>>,
    lifecycle: Mutex<HashMap<String, Lifecycle>>,
    results: Mutex<HashMap<String, (String, String)>>,
    queue: Mutex<VecDeque<Job>>,
    recent: Mutex<HashMap<String, (String, Instant)>>,
    active_locale: Mutex<ActiveLocale>,
    wake: tokio::sync::Notify,
    pub dispatch_lock: tokio::sync::Mutex<()>,
}
fn validation() -> AppError {
    AppError::Validation("discord.error.invalid_url".into())
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
    fn set_locale(&self, locale: &str) -> AppResult<()> {
        if !SUPPORTED_LOCALES.contains(&locale) {
            return Err(AppError::Validation("discord.error.locale_invalid".into()));
        }
        {
            let mut active = self.active_locale.lock().unwrap();
            if active.ready && active.locale == locale {
                return Ok(());
            }
            active.locale = locale.into();
            active.generation = uuid::Uuid::new_v4().to_string();
            active.ready = true;
        }
        let cancelled: Vec<(String, String)> = {
            let mut queue = self.queue.lock().unwrap();
            let cancelled = queue
                .iter()
                .map(|job| (job.server_id.clone(), job.generation.clone()))
                .collect();
            queue.clear();
            cancelled
        };
        self.recent.lock().unwrap().clear();
        for (server_id, generation) in cancelled {
            self.record_result(&server_id, &generation, "cancelled");
        }
        let configurations = self.configurations.lock().unwrap();
        let mut results = self.results.lock().unwrap();
        for (id, config) in configurations.iter() {
            if results.get(id).is_some_and(|(generation, result)| {
                generation == &config.generation && result == "queued"
            }) {
                results.insert(id.clone(), (config.generation.clone(), "cancelled".into()));
            }
        }
        Ok(())
    }
    fn locale_snapshot(&self) -> Option<(String, String)> {
        let active = self.active_locale.lock().unwrap();
        active
            .ready
            .then(|| (active.locale.clone(), active.generation.clone()))
    }
    fn job_locale_is_current(&self, job: &Job) -> bool {
        let active = self.active_locale.lock().unwrap();
        active.ready && active.generation == job.locale_generation
    }
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
        self.results.lock().unwrap().remove(id);
        Ok(())
    }
    fn record_result(&self, id: &str, generation: &str, result: &str) {
        let configurations = self.configurations.lock().unwrap();
        if configurations
            .get(id)
            .is_some_and(|config| config.generation == generation)
        {
            self.results
                .lock()
                .unwrap()
                .insert(id.into(), (generation.into(), result.into()));
        }
    }
    fn record_job_result(&self, id: &str, generation: &str, locale_generation: &str, result: &str) {
        let locale = self.active_locale.lock().unwrap();
        if locale.ready && locale.generation == locale_generation {
            self.record_result(id, generation, result);
        }
    }
    pub fn view(&self, id: &str) -> AppResult<View> {
        let config = self.config(id)?;
        let last_result = config
            .as_ref()
            .and_then(|config| {
                self.results
                    .lock()
                    .unwrap()
                    .get(id)
                    .filter(|(generation, _)| generation == &config.generation)
                    .map(|(_, result)| result.clone())
            })
            .unwrap_or_else(|| "not_sent".into());
        Ok(View {
            registered: config.is_some(),
            enabled: config.as_ref().is_some_and(|c| c.enabled),
            events: config
                .as_ref()
                .map_or_else(Events::default, |c| c.events.clone()),
            mentions: config
                .as_ref()
                .map_or_else(MentionSettings::new_destination, |c| c.mentions.clone()),
            destination_id: config.map(|c| c.generation),
            last_result,
        })
    }
    pub fn disable(&self, id: &str) -> AppResult<()> {
        if let Some(mut config) = self.config(id)? {
            config.enabled = false;
            config.generation = uuid::Uuid::new_v4().to_string();
            let generation = config.generation.clone();
            self.save(id, config)?;
            self.record_result(id, &generation, "cancelled");
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
        let Some((locale, locale_generation)) = self.locale_snapshot() else {
            self.record_result(&profile.id, &config.generation, "locale_not_ready");
            return Ok(());
        };
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
            drop(queue);
            self.record_job_result(
                &profile.id,
                &config.generation,
                &locale_generation,
                "queue_full",
            );
            return Ok(());
        }
        queue.push_back(Job {
            server_id: profile.id.clone(),
            name: profile.name.chars().take(64).collect(),
            event: event.into(),
            generation: config.generation,
            locale,
            locale_generation,
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
                    if !state.discord.job_locale_is_current(&job) {
                        return Delivery::Failure("cancelled");
                    }
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
                    if config.mentions.validate(true).is_err() {
                        return Delivery::Failure("mention_configuration_invalid");
                    }
                    if validate_url(&config.url).is_err() {
                        return Delivery::Failure("delivery_failed");
                    }
                    send_webhook(
                        &client,
                        &config.url,
                        &payload(
                            &job.name,
                            &job.event,
                            &job.at,
                            &config.mentions,
                            &job.locale,
                        ),
                    )
                    .await
                })
                .await;
                state.discord.record_job_result(
                    &job.server_id,
                    &job.generation,
                    &job.locale_generation,
                    result,
                );
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

// Shared native HTTP executor. Authorization and queue fencing stay in the
// production worker above; the test runner independently verifies its lease.
async fn send_webhook(client: &reqwest::Client, value: &str, body: &serde_json::Value) -> Delivery {
    if validate_url(value).is_err() {
        return Delivery::Failure("delivery_failed");
    }
    let Ok(mut url) = reqwest::Url::parse(value) else {
        return Delivery::Failure("delivery_failed");
    };
    url.query_pairs_mut().append_pair("wait", "true");
    match client.post(url).json(body).send().await {
        Ok(response) if response.status().is_success() => Delivery::Sent,
        Ok(response) if response.status().as_u16() == 429 => {
            let retry = crate::secure_secrets::bounded_json::<serde_json::Value>(response, 4096)
                .await
                .ok()
                .and_then(|v| v["retry_after"].as_f64())
                .unwrap_or(31.0);
            Delivery::Retry(retry)
        }
        Ok(_) => Delivery::Failure("delivery_failed"),
        Err(error) if error.is_timeout() => Delivery::Failure("timeout"),
        Err(_) => Delivery::Failure("network_failed"),
    }
}

#[cfg(test)]
pub(crate) async fn lab_notification<F: Fn() -> bool>(
    webhook: &str,
    locale: &str,
    mentions: serde_json::Value,
    confirmed: bool,
    authorize: F,
) -> serde_json::Value {
    let Ok(mentions) = serde_json::from_value::<MentionSettings>(mentions) else {
        return serde_json::json!({"result":"invalid_mentions"});
    };
    if mentions.validate(true).is_err() || !SUPPORTED_LOCALES.contains(&locale) {
        return serde_json::json!({"result":"invalid_settings"});
    }
    if !authorize() {
        return serde_json::json!({"result":"qualification_required"});
    }
    let body = payload(
        "TomoNode Lab",
        "test",
        &chrono::Utc::now().to_rfc3339(),
        &mentions,
        locale,
    );
    if !confirmed {
        return serde_json::json!({"result":"preview", "payload":body});
    }
    if validate_url(webhook).is_err() {
        return serde_json::json!({"result":"invalid_webhook"});
    }
    let Ok(client) = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(8))
        .build()
    else {
        return serde_json::json!({"result":"client_unavailable"});
    };
    let result = deliver(|| async {
        if !authorize() {
            return Delivery::Failure("qualification_required");
        }
        send_webhook(&client, webhook, &body).await
    })
    .await;
    serde_json::json!({"result":result})
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
fn safe_server_name(name: &str) -> String {
    let mut safe = String::new();
    let mut count = 0;
    for character in name.chars() {
        let character = if character.is_control()
            || matches!(character, '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
        {
            ' '
        } else {
            character
        };
        let width = if character == '@' { 2 } else { 1 };
        if count + width > 64 {
            break;
        }
        if character == '@' {
            safe.push('@');
            safe.push('\u{200b}');
        } else {
            safe.push(character);
        }
        count += width;
    }
    safe.trim().to_string()
}
fn format_time_in<Tz: chrono::TimeZone>(at: &str, timezone: &Tz) -> String
where
    Tz::Offset: std::fmt::Display,
{
    chrono::DateTime::parse_from_rfc3339(at)
        .map(|value| {
            value
                .with_timezone(timezone)
                .format("%Y-%m-%d %H:%M")
                .to_string()
        })
        .unwrap_or_else(|_| "unknown".into())
}
fn event_copy(locale: &str, event: &str) -> (&'static str, &'static str) {
    match locale {
        "en" => match event {
            "started" => ("Server started", "Occurred"),
            "stopped" => ("Server stopped", "Occurred"),
            "crashed" => ("Unexpected shutdown — check server diagnostics", "Occurred"),
            _ => ("Test notification (does not change server state)", "Sent"),
        },
        "zh-CN" => match event {
            "started" => ("服务器已启动", "发生时间"),
            "stopped" => ("服务器已停止", "发生时间"),
            "crashed" => ("意外关闭，请检查服务器诊断", "发生时间"),
            _ => ("测试通知（不会更改服务器状态）", "发送时间"),
        },
        "zh-TW" => match event {
            "started" => ("伺服器已啟動", "發生時間"),
            "stopped" => ("伺服器已停止", "發生時間"),
            "crashed" => ("意外關閉，請檢查伺服器診斷", "發生時間"),
            _ => ("測試通知（不會變更伺服器狀態）", "傳送時間"),
        },
        "ko" => match event {
            "started" => ("서버 시작", "발생 시각"),
            "stopped" => ("서버 중지", "발생 시각"),
            "crashed" => ("예기치 않은 종료 — 서버 진단을 확인하세요", "발생 시각"),
            _ => ("테스트 알림 (서버 상태는 변경되지 않음)", "전송 시각"),
        },
        "es" => match event {
            "started" => ("Servidor iniciado", "Hora del evento"),
            "stopped" => ("Servidor detenido", "Hora del evento"),
            "crashed" => (
                "Cierre inesperado; revisa el diagnóstico del servidor",
                "Hora del evento",
            ),
            _ => (
                "Notificación de prueba (no cambia el estado del servidor)",
                "Hora de envío",
            ),
        },
        "de" => match event {
            "started" => ("Server gestartet", "Ereigniszeit"),
            "stopped" => ("Server beendet", "Ereigniszeit"),
            "crashed" => (
                "Unerwartetes Herunterfahren — Serverdiagnose prüfen",
                "Ereigniszeit",
            ),
            _ => (
                "Testbenachrichtigung (ändert den Serverstatus nicht)",
                "Sendezeit",
            ),
        },
        "fr" => match event {
            "started" => ("Serveur démarré", "Heure de l’événement"),
            "stopped" => ("Serveur arrêté", "Heure de l’événement"),
            "crashed" => (
                "Arrêt inattendu — consultez le diagnostic du serveur",
                "Heure de l’événement",
            ),
            _ => (
                "Notification de test (ne modifie pas le serveur)",
                "Heure d’envoi",
            ),
        },
        "pt-BR" => match event {
            "started" => ("Servidor iniciado", "Horário do evento"),
            "stopped" => ("Servidor parado", "Horário do evento"),
            "crashed" => (
                "Encerramento inesperado — confira o diagnóstico do servidor",
                "Horário do evento",
            ),
            _ => (
                "Notificação de teste (não altera o servidor)",
                "Horário de envio",
            ),
        },
        _ => match event {
            "started" => ("起動完了", "発生時刻"),
            "stopped" => ("停止完了", "発生時刻"),
            "crashed" => ("異常終了・サーバー診断を確認してください", "発生時刻"),
            _ => ("テスト通知（サーバーの状態は変更しません）", "送信時刻"),
        },
    }
}
fn payload(
    name: &str,
    event: &str,
    at: &str,
    mentions: &MentionSettings,
    locale: &str,
) -> serde_json::Value {
    let (label, time_label) = event_copy(locale, event);
    let local_time = format_time_in(at, &chrono::Local);
    let (prefix, parse, roles) = if !mentions.enabled {
        (String::new(), serde_json::json!([]), serde_json::json!([]))
    } else {
        match mentions.mode {
            MentionMode::Role if mentions.validate(true).is_ok() => (
                format!("<@&{}>", mentions.role_id.trim()),
                serde_json::json!([]),
                serde_json::json!([mentions.role_id.trim()]),
            ),
            MentionMode::Here => (
                "@here".into(),
                serde_json::json!(["everyone"]),
                serde_json::json!([]),
            ),
            MentionMode::Everyone => (
                "@everyone".into(),
                serde_json::json!(["everyone"]),
                serde_json::json!([]),
            ),
            MentionMode::Role => (String::new(), serde_json::json!([]), serde_json::json!([])),
        }
    };
    let prefix = if prefix.is_empty() {
        String::new()
    } else {
        format!("{prefix}\n")
    };
    serde_json::json!({
        "content": format!("{prefix}TomoNode｜{}\n{label}\n{time_label}: {local_time}", safe_server_name(name)),
        "allowed_mentions": {"parse": parse, "users": [], "roles": roles, "replied_user": false},
        "tts": false
    })
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
pub async fn discord_set_locale(locale: String, state: State<'_, AppState>) -> AppResult<()> {
    let _dispatch = state.discord.dispatch_lock.lock().await;
    state.discord.set_locale(&locale)
}
#[tauri::command]
pub async fn discord_save_destination(
    server_id: String,
    webhook_url: String,
    mentions: MentionSettings,
    confirmed: bool,
    state: State<'_, AppState>,
) -> AppResult<View> {
    if !confirmed {
        return Err(AppError::Validation(
            "discord.error.confirmation_required".into(),
        ));
    }
    membership::require_supporter(&state)
        .await
        .map_err(|_| AppError::Validation("discord.error.qualification_required".into()))?;
    state.store.lock().unwrap().get_server(&server_id)?;
    mentions.validate(false)?;
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
            mentions,
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
    mentions: MentionSettings,
    confirmed: bool,
    state: State<'_, AppState>,
) -> AppResult<View> {
    if enabled {
        membership::require_supporter(&state)
            .await
            .map_err(|_| AppError::Validation("discord.error.qualification_required".into()))?;
    }
    state.store.lock().unwrap().get_server(&server_id)?;
    let _dispatch = state.discord.dispatch_lock.lock().await;
    let mut config = state
        .discord
        .config(&server_id)?
        .ok_or_else(|| AppError::Validation("discord.error.destination_required".into()))?;
    mentions.validate(enabled)?;
    let mentions_changed = mentions != config.mentions;
    let event_added = (!config.events.started && events.started)
        || (!config.events.stopped && events.stopped)
        || (!config.events.crashed && events.crashed);
    if (enabled || mentions_changed || event_added) && !confirmed {
        return Err(AppError::Validation(
            "discord.error.confirmation_required".into(),
        ));
    }
    let was_enabled = config.enabled;
    // A destination/mention target change always pauses delivery. The user
    // must separately enable the new target after reviewing it.
    config.enabled = enabled && !mentions_changed;
    config.events = events;
    config.mentions = mentions;
    config.generation = uuid::Uuid::new_v4().to_string();
    config.session_binding = current_binding();
    let generation = config.generation.clone();
    state.discord.save(&server_id, config)?;
    if was_enabled || mentions_changed {
        state
            .discord
            .record_result(&server_id, &generation, "cancelled");
    }
    state.discord.view(&server_id)
}
#[tauri::command]
pub async fn discord_delete_destination(
    server_id: String,
    confirmed: bool,
    state: State<'_, AppState>,
) -> AppResult<View> {
    if !confirmed {
        return Err(AppError::Validation(
            "discord.error.confirmation_required".into(),
        ));
    }
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
    state.discord.recent.lock().unwrap().remove(&server_id);
    state.discord.results.lock().unwrap().remove(&server_id);
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
            "discord.error.confirmation_required".into(),
        ));
    }
    membership::require_supporter(&state)
        .await
        .map_err(|_| AppError::Validation("discord.error.qualification_required".into()))?;
    let profile = state.store.lock().unwrap().get_server(&server_id)?;
    let _dispatch = state.discord.dispatch_lock.lock().await;
    if state.discord.locale_snapshot().is_none() {
        return Err(AppError::Validation(
            "discord.error.locale_not_ready".into(),
        ));
    }
    let Some(config) = state.discord.config(&server_id)? else {
        return Err(AppError::Validation(
            "discord.error.destination_required".into(),
        ));
    };
    if !config.enabled {
        return Err(AppError::Validation(
            "discord.error.notifications_disabled".into(),
        ));
    }
    config.mentions.validate(true)?;
    state.discord.enqueue(&profile, "test")?;
    state
        .discord
        .record_result(&server_id, &config.generation, "queued");
    state.discord.view(&server_id)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_queue_coalesces_duplicates_and_clears_jobs_on_replace_or_disable() {
        let service = DiscordService::default();
        service.set_locale("ja").unwrap();
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
            mentions: MentionSettings::default(),
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
        let value = payload(
            "@everyone @here",
            "started",
            "2026-09-30T00:00:00Z",
            &MentionSettings::default(),
            "ja",
        );
        assert_eq!(value["allowed_mentions"]["parse"], serde_json::json!([]));
        assert_eq!(value["allowed_mentions"]["roles"], serde_json::json!([]));
        assert!(!value["content"].as_str().unwrap().contains("@everyone"));
        assert!(!value["content"].as_str().unwrap().contains("@here"));
        assert!(!value.to_string().contains("rootPath"));
    }
    #[test]
    fn selected_mention_is_the_only_allowed_target_and_names_cannot_add_mentions() {
        let name = "World @everyone @here <@123456789012345678>";
        let role_id = "123456789012345678";
        let role = payload(
            name,
            "started",
            "2026-09-30T00:00:00Z",
            &MentionSettings {
                enabled: true,
                mode: MentionMode::Role,
                role_id: role_id.into(),
            },
            "ja",
        );
        assert!(
            role["content"]
                .as_str()
                .unwrap()
                .starts_with(&format!("<@&{role_id}>\n"))
        );
        assert_eq!(role["allowed_mentions"]["parse"], serde_json::json!([]));
        assert_eq!(role["allowed_mentions"]["users"], serde_json::json!([]));
        assert_eq!(
            role["allowed_mentions"]["roles"],
            serde_json::json!([role_id])
        );
        let content = role["content"].as_str().unwrap();
        assert!(content.contains("@\u{200b}everyone"));
        assert!(content.contains("@\u{200b}here"));
        assert!(content.contains("<@\u{200b}123456789012345678>"));
        assert!(!content.contains("@everyone"));
        assert!(!content.contains("@here"));

        for (mode, token) in [
            (MentionMode::Here, "@here\n"),
            (MentionMode::Everyone, "@everyone\n"),
        ] {
            let value = payload(
                "Friendly server",
                "test",
                "2026-09-30T00:00:00Z",
                &MentionSettings {
                    enabled: true,
                    mode,
                    role_id: String::new(),
                },
                "en",
            );
            assert!(value["content"].as_str().unwrap().starts_with(token));
            assert_eq!(
                value["allowed_mentions"]["parse"],
                serde_json::json!(["everyone"])
            );
            assert_eq!(value["allowed_mentions"]["roles"], serde_json::json!([]));
            assert_eq!(value["allowed_mentions"]["users"], serde_json::json!([]));
        }
    }
    #[test]
    fn invalid_or_missing_role_id_cannot_enable_role_mentions() {
        let missing = MentionSettings {
            enabled: true,
            mode: MentionMode::Role,
            role_id: String::new(),
        };
        assert!(missing.validate(true).is_err());
        assert!(missing.validate(false).is_ok());
        for role_id in ["123", "12345678901234567x", "12345678901234567890123"] {
            let settings = MentionSettings {
                enabled: true,
                mode: MentionMode::Role,
                role_id: role_id.into(),
            };
            assert!(settings.validate(true).is_err());
        }
        let valid = MentionSettings {
            enabled: true,
            mode: MentionMode::Role,
            role_id: "123456789012345678".into(),
        };
        assert!(valid.validate(true).is_ok());
    }
    #[test]
    fn notification_time_uses_supplied_host_offset_and_utc_event_is_preserved() {
        let utc = "2026-10-01T11:48:00Z";
        let tokyo = chrono::FixedOffset::east_opt(9 * 60 * 60).unwrap();
        let west = chrono::FixedOffset::west_opt(4 * 60 * 60).unwrap();
        assert_eq!(format_time_in(utc, &tokyo), "2026-10-01 20:48");
        assert_eq!(format_time_in(utc, &west), "2026-10-01 07:48");
        let english = payload("World", "started", utc, &MentionSettings::default(), "en");
        assert!(
            english["content"]
                .as_str()
                .unwrap()
                .contains("Server started\nOccurred: ")
        );
        assert_eq!(
            english["content"]
                .as_str()
                .unwrap()
                .split("Occurred: ")
                .nth(1)
                .unwrap()
                .len(),
            16
        );
        assert_eq!(event_copy("zh-CN", "started").0, "服务器已启动");
        assert_eq!(event_copy("zh-TW", "started").0, "伺服器已啟動");
        assert_eq!(format_time_in("not-a-time", &tokyo), "unknown");
    }
    #[test]
    fn locale_sync_invalidates_unstarted_jobs_and_blocks_delivery_until_ready() {
        let service = DiscordService::default();
        assert!(service.locale_snapshot().is_none());
        assert!(service.set_locale("ru").is_err());
        assert!(service.locale_snapshot().is_none());
        service.set_locale("ja").unwrap();
        let profile = ServerProfile {
            id: "locale-test".into(),
            name: "Locale test".into(),
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
            mentions: MentionSettings::default(),
            generation: "locale-config-generation".into(),
            session_binding: None,
        };
        service.save(&profile.id, config).unwrap();
        service.enqueue(&profile, "started").unwrap();
        let old_job = service.queue.lock().unwrap().pop_front().unwrap();
        assert_eq!(old_job.locale, "ja");
        assert!(service.job_locale_is_current(&old_job));
        service.queue.lock().unwrap().push_back(old_job);
        service.set_locale("en").unwrap();
        assert!(service.queue.lock().unwrap().is_empty());
        assert_eq!(service.view(&profile.id).unwrap().last_result, "cancelled");
        let stale = Job {
            server_id: profile.id.clone(),
            name: "test".into(),
            event: "started".into(),
            generation: "locale-config-generation".into(),
            locale: "ja".into(),
            locale_generation: "stale".into(),
            at: "2026-10-01T11:48:00Z".into(),
            queued: Instant::now(),
        };
        assert!(!service.job_locale_is_current(&stale));
        secure_secrets::delete(SERVICE, &profile.id).unwrap();
    }
    #[test]
    fn legacy_configuration_without_mentions_defaults_to_none_not_everyone() {
        let config: Config = serde_json::from_value(serde_json::json!({
            "url": "test-only-secret",
            "enabled": true,
            "events": { "started": true, "stopped": false, "crashed": false },
            "generation": "legacy"
        }))
        .unwrap();
        assert!(config.enabled);
        assert!(!config.mentions.enabled);
        assert_eq!(config.mentions.mode, MentionMode::Everyone);
        assert!(config.mentions.role_id.is_empty());
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
                    mentions: MentionSettings::default(),
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
    #[test]
    fn stale_delivery_result_cannot_overwrite_replacement_or_recreate_deleted_result() {
        let service = DiscordService::default();
        let config = Config {
            url: "test-only-secret".into(),
            enabled: true,
            events: Events::default(),
            mentions: MentionSettings::default(),
            generation: "first-generation".into(),
            session_binding: None,
        };
        service.save("result-test", config.clone()).unwrap();
        service.record_result("result-test", "first-generation", "sent");
        assert_eq!(service.view("result-test").unwrap().last_result, "sent");

        let mut replacement = config;
        replacement.generation = "second-generation".into();
        service.save("result-test", replacement).unwrap();
        service.record_result("result-test", "first-generation", "sent");
        assert_eq!(service.view("result-test").unwrap().last_result, "not_sent");

        secure_secrets::delete(SERVICE, "result-test").unwrap();
        service.configurations.lock().unwrap().remove("result-test");
        service.results.lock().unwrap().remove("result-test");
        service.record_result("result-test", "second-generation", "sent");
        assert_eq!(service.view("result-test").unwrap().last_result, "not_sent");
        assert!(!service.results.lock().unwrap().contains_key("result-test"));
    }
}
