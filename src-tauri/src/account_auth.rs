use base64::{Engine, engine::general_purpose::STANDARD as BASE64_STANDARD};
use reqwest::{StatusCode, Url, header};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{Mutex, MutexGuard, OnceLock},
    time::{Duration, Instant},
};
use tauri::State;
use uuid::Uuid;

use crate::{
    AppState,
    error::{AppError, AppResult},
};

const CREDENTIAL_SERVICE: &str = "TomoNode Account Session";
const CREDENTIAL_ACCOUNT: &str = "current";
const BROWSER_LOGIN_URL: &str = "https://tomonode.site/account.html";
const BROWSER_AUTH_TTL: Duration = Duration::from_secs(600);

struct BrowserAuthSecret(Vec<u8>);

impl Drop for BrowserAuthSecret {
    fn drop(&mut self) {
        self.0.fill(0);
    }
}

struct BrowserAuthAttempt {
    client_attempt_id: String,
    request_id: String,
    verifier: BrowserAuthSecret,
    expires_at: Instant,
    polling: bool,
}

#[derive(Default)]
struct BrowserAuthState {
    generation: u64,
    client_attempt_id: Option<String>,
    pending: Option<BrowserAuthAttempt>,
}

static BROWSER_AUTH: OnceLock<Mutex<BrowserAuthState>> = OnceLock::new();

fn browser_auth_state() -> &'static Mutex<BrowserAuthState> {
    BROWSER_AUTH.get_or_init(|| Mutex::new(BrowserAuthState::default()))
}

fn lock_browser_auth() -> AppResult<MutexGuard<'static, BrowserAuthState>> {
    browser_auth_state()
        .lock()
        .map_err(|_| AppError::Other("ログイン手続きを確認できませんでした".into()))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserAuthStart {
    pub browser_url: String,
    pub request_id: String,
    pub user_code: String,
    pub expires_in_seconds: u64,
    pub interval_seconds: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserAuthStartRequest<'a> {
    code_challenge: &'a str,
    mode: &'a str,
    locale: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserAuthPollRequest<'a> {
    request_id: &'a str,
    code_verifier: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserAuthPollResponse {
    status: String,
    #[serde(default)]
    access_token: Option<String>,
    // The Worker currently returns epoch milliseconds; accept a future ISO representation too.
    #[serde(default)]
    expires_at: Option<serde_json::Value>,
    #[serde(default)]
    account: Option<AccountProfile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserAuthStartResponse {
    browser_url: String,
    request_id: String,
    user_code: String,
    expires_in_seconds: u64,
    interval_seconds: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserAuthPollResult {
    pub status: &'static str,
    pub account: Option<AccountProfile>,
}

fn valid_browser_request_id(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn valid_browser_client_attempt_id(value: &str) -> bool {
    valid_browser_request_id(value)
}

fn valid_browser_user_code(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 9
        && bytes[4] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ".contains(byte))
}

fn random_browser_verifier() -> BrowserAuthSecret {
    let value = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    BrowserAuthSecret(value.into_bytes())
}

fn browser_code_challenge(verifier: &[u8]) -> String {
    Sha256::digest(verifier)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn validate_browser_auth_url(
    value: &str,
    request_id: &str,
    mode: &str,
    locale: &str,
) -> AppResult<Url> {
    let url = Url::parse(value)
        .map_err(|_| AppError::Other("ログインページの安全確認に失敗しました".into()))?;
    let mut query = HashMap::new();
    let query_is_valid = url.query_pairs().all(|(key, value)| {
        if !matches!(key.as_ref(), "request" | "mode" | "lang") || query.contains_key(key.as_ref())
        {
            return false;
        }
        query.insert(key.into_owned(), value.into_owned());
        true
    });
    if url.scheme() != "https"
        || url.host_str() != Some("tomonode.site")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/account.html"
        || url.fragment().is_some()
        || !query_is_valid
        || query.len() != 3
        || query.get("request").map(String::as_str) != Some(request_id)
        || query.get("mode").map(String::as_str) != Some(mode)
        || query.get("lang").map(String::as_str) != Some(locale)
    {
        return Err(AppError::Other(
            "ログインページの安全確認に失敗しました".into(),
        ));
    }
    Ok(url)
}

fn production_api_host() -> Option<String> {
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../../account-api.json")).ok()?;
    let base = Url::parse(config.get("baseUrl")?.as_str()?).ok()?;
    if base.scheme() != "https"
        || base.username() != ""
        || base.password().is_some()
        || base.path() != "/"
        || base.query().is_some()
        || base.fragment().is_some()
        || base.port().is_some_and(|port| port != 443)
    {
        return None;
    }
    Some(base.host_str()?.to_owned())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccountProfile {
    pub email: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub has_password: bool,
    #[serde(default)]
    pub avatar_data_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccountPasswordChallenge {
    pub challenge_id: String,
    pub expires_in_seconds: u64,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccountPasswordSetup {
    pub setup_token: String,
    pub expires_in_seconds: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
    access_token: String,
}

#[derive(Serialize)]
struct EmailRequest<'a> {
    email: &'a str,
}

#[derive(Serialize)]
struct CodeRequest<'a> {
    email: &'a str,
    code: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PasswordLoginRequest<'a> {
    email: &'a str,
    password: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginCodeRequest<'a> {
    challenge_id: &'a str,
    code: &'a str,
}

#[derive(Serialize)]
struct EnrollmentCodeRequest<'a> {
    email: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnrollmentVerifyRequest<'a> {
    email: &'a str,
    code: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnrollPasswordRequest<'a> {
    email: &'a str,
    setup_token: &'a str,
    password: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DisplayNameRequest<'a> {
    display_name: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AvatarRequest<'a> {
    mime_type: &'a str,
    data_base64: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerifyResponse {
    access_token: String,
    account: AccountProfile,
}

#[derive(Deserialize)]
struct ApiError {
    error: Option<String>,
}

#[cfg(all(windows, not(test)))]
fn credential_entry() -> AppResult<keyring::Entry> {
    keyring::Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT)
        .map_err(|_| AppError::Other("Windows資格情報マネージャーを準備できません".into()))
}

#[cfg(all(windows, test))]
mod test_credentials {
    use std::{
        any::Any,
        collections::HashMap,
        sync::{Arc, Mutex, OnceLock},
    };

    use keyring::credential::CredentialApi;

    type Secret = Arc<Mutex<Option<Vec<u8>>>>;
    static VALUES: OnceLock<Mutex<HashMap<String, Secret>>> = OnceLock::new();

    struct MemoryCredential(Secret);

    impl CredentialApi for MemoryCredential {
        fn set_secret(&self, secret: &[u8]) -> keyring::Result<()> {
            *self.0.lock().expect("test credential mutex poisoned") = Some(secret.to_vec());
            Ok(())
        }

        fn get_secret(&self) -> keyring::Result<Vec<u8>> {
            self.0
                .lock()
                .expect("test credential mutex poisoned")
                .clone()
                .ok_or(keyring::Error::NoEntry)
        }

        fn delete_credential(&self) -> keyring::Result<()> {
            self.0
                .lock()
                .expect("test credential mutex poisoned")
                .take()
                .map(|_| ())
                .ok_or(keyring::Error::NoEntry)
        }

        fn as_any(&self) -> &dyn Any {
            self
        }
    }

    pub(super) fn entry() -> AppResult<keyring::Entry> {
        let values = VALUES.get_or_init(|| Mutex::new(HashMap::new()));
        let secret = values
            .lock()
            .expect("test credential map poisoned")
            .entry(format!("{CREDENTIAL_SERVICE}\\0{CREDENTIAL_ACCOUNT}"))
            .or_insert_with(|| Arc::new(Mutex::new(None)))
            .clone();
        Ok(keyring::Entry::new_with_credential(Box::new(
            MemoryCredential(secret),
        )))
    }

    use super::{AppResult, CREDENTIAL_ACCOUNT, CREDENTIAL_SERVICE};
}

#[cfg(all(windows, test))]
fn credential_entry() -> AppResult<keyring::Entry> {
    test_credentials::entry()
}

#[cfg(windows)]
fn store_session(session: &StoredSession) -> AppResult<()> {
    let encoded = serde_json::to_string(session)?;
    credential_entry()?.set_password(&encoded).map_err(|_| {
        AppError::Other("ログイン情報をWindows資格情報マネージャーへ保存できません".into())
    })
}

#[cfg(not(windows))]
fn store_session(_session: &StoredSession) -> AppResult<()> {
    Err(AppError::Validation(
        "TomoNodeアカウント機能は現在Windows版で利用できます".into(),
    ))
}

#[cfg(windows)]
fn load_session() -> AppResult<Option<StoredSession>> {
    match credential_entry()?.get_password() {
        Ok(value) => Ok(Some(serde_json::from_str(&value)?)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(AppError::Other(
            "Windows資格情報マネージャーからログイン情報を読み取れません".into(),
        )),
    }
}

#[cfg(not(windows))]
fn load_session() -> AppResult<Option<StoredSession>> {
    Ok(None)
}

#[cfg(windows)]
fn clear_session() -> AppResult<()> {
    match credential_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(AppError::Other(
            "Windows資格情報マネージャーからログイン情報を削除できません".into(),
        )),
    }
}

#[cfg(not(windows))]
fn clear_session() -> AppResult<()> {
    Ok(())
}

fn api_endpoint(base: &str, path: &str) -> AppResult<Url> {
    let mut base = Url::parse(base.trim())
        .map_err(|_| AppError::Validation("アカウントAPIのURLが正しくありません".into()))?;
    let host = base.host_str().unwrap_or_default();
    let is_local_dev = cfg!(debug_assertions)
        && base.scheme() == "http"
        && matches!(host, "localhost" | "127.0.0.1");
    let allowed_port = base.port().is_none_or(|port| port == 443 || is_local_dev);
    let is_production = base.scheme() == "https"
        && base.port().is_none_or(|port| port == 443)
        && production_api_host().as_deref() == Some(host);
    if base.username() != ""
        || base.password().is_some()
        || base.query().is_some()
        || base.fragment().is_some()
        || !allowed_port
        || !(is_production || is_local_dev)
    {
        return Err(AppError::Validation(
            "許可されていないアカウントAPIの接続先です".into(),
        ));
    }
    if !base.path().ends_with('/') {
        let path = format!("{}/", base.path());
        base.set_path(&path);
    }
    base.join(path)
        .map_err(|_| AppError::Validation("アカウントAPIのURLが正しくありません".into()))
}

fn status_error(status: StatusCode, body: &[u8]) -> AppError {
    let code = serde_json::from_slice::<ApiError>(body)
        .ok()
        .and_then(|value| value.error)
        .unwrap_or_default();
    let message = match code.as_str() {
        "RATE_LIMITED" => "試行回数が多すぎます。しばらく待ってから再度お試しください。",
        "INVALID_OR_EXPIRED_CODE" | "INVALID_CODE" => {
            "確認コードが正しくないか、有効期限が切れています。"
        }
        "EMAIL_UNAVAILABLE" => "確認メールを送信できませんでした。時間をおいて再度お試しください。",
        "SESSION_EXPIRED" => "ログインの有効期限が切れました。もう一度ログインしてください。",
        "INVALID_CREDENTIALS" => "メールアドレスまたはパスワードが正しくありません。",
        "PASSWORD_REQUIREMENTS_NOT_MET" => {
            "パスワードは6〜128文字（UTF-8で512バイト以下）で入力してください。"
        }
        "POLL_TOO_FREQUENT" => "次のログイン確認まで少し待ってから再試行してください。",
        "BROWSER_AUTH_EXPIRED" => {
            "ログインコードの有効期限が切れました。もう一度ログインしてください。"
        }
        "INVALID_OR_EXPIRED_CHALLENGE" | "INVALID_SETUP_TOKEN" => {
            "確認手続きの有効期限が切れました。最初からやり直してください。"
        }
        "INVALID_DISPLAY_NAME" => "表示名は1〜32文字で入力してください。",
        "INVALID_AVATAR" => "PNG、JPEG、WebPの画像（128 KiB以下）を選んでください。",
        _ if status == StatusCode::TOO_MANY_REQUESTS => {
            "試行回数が多すぎます。しばらく待ってから再度お試しください。"
        }
        _ => "アカウントサービスとの通信に失敗しました。時間をおいて再度お試しください。",
    };
    AppError::Other(message.into())
}

async fn decode_response<T: DeserializeOwned>(response: reqwest::Response) -> AppResult<T> {
    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|_| AppError::Other("アカウントサービスの応答を読み取れません".into()))?;
    if !status.is_success() {
        return Err(status_error(status, &bytes));
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| AppError::Other("アカウントサービスの応答形式が正しくありません".into()))
}

fn network_error() -> AppError {
    AppError::Other(
        "アカウントサービスに接続できません。ネットワークとサービス設定を確認してください".into(),
    )
}

const AVATAR_MAX_BYTES: usize = 128 * 1024;
const AVATAR_MAX_BASE64_CHARS: usize = 175 * 1024;

fn is_safe_opaque_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn valid_image_bytes(mime_type: &str, bytes: &[u8]) -> bool {
    match mime_type {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "image/webp" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP",
        _ => false,
    }
}

fn decode_avatar(mime_type: &str, data_base64: &str) -> AppResult<Vec<u8>> {
    if data_base64.is_empty() || data_base64.len() > AVATAR_MAX_BASE64_CHARS {
        return Err(AppError::Validation(
            "画像はPNG、JPEG、WebPで128 KiB以下にしてください".into(),
        ));
    }
    let bytes = BASE64_STANDARD
        .decode(data_base64)
        .map_err(|_| AppError::Validation("画像データの形式が正しくありません".into()))?;
    if bytes.len() > AVATAR_MAX_BYTES || !valid_image_bytes(mime_type, &bytes) {
        return Err(AppError::Validation(
            "画像はPNG、JPEG、WebPで128 KiB以下にしてください".into(),
        ));
    }
    Ok(bytes)
}

async fn load_avatar(
    api_base_url: &str,
    client: &reqwest::Client,
    access_token: &str,
) -> AppResult<Option<String>> {
    let url = api_endpoint(api_base_url, "v1/me/avatar")?;
    let response = client
        .get(url)
        .bearer_auth(access_token)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|_| network_error())?;
    if response.status() == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let status = response.status();
    if !status.is_success() {
        let body = response.bytes().await.unwrap_or_default();
        return Err(status_error(status, &body));
    }
    let mime_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .map(str::to_owned)
        .unwrap_or_default();
    if !matches!(
        mime_type.as_str(),
        "image/png" | "image/jpeg" | "image/webp"
    ) || response
        .content_length()
        .is_some_and(|length| length > AVATAR_MAX_BYTES as u64)
    {
        return Err(AppError::Other(
            "プロフィール画像の安全確認に失敗しました".into(),
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| AppError::Other("プロフィール画像を読み取れません".into()))?;
    if bytes.len() > AVATAR_MAX_BYTES || !valid_image_bytes(&mime_type, &bytes) {
        return Err(AppError::Other(
            "プロフィール画像の安全確認に失敗しました".into(),
        ));
    }
    Ok(Some(format!(
        "data:{mime_type};base64,{}",
        BASE64_STANDARD.encode(bytes)
    )))
}

async fn attach_avatar(
    api_base_url: &str,
    client: &reqwest::Client,
    access_token: &str,
    profile: &mut AccountProfile,
) {
    profile.avatar_data_url = load_avatar(api_base_url, client, access_token)
        .await
        .ok()
        .flatten();
}

async fn finish_login(
    api_base_url: &str,
    access_token: String,
    mut profile: AccountProfile,
    client: &reqwest::Client,
) -> AppResult<AccountProfile> {
    if access_token.len() != 64 || !access_token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(AppError::Other(
            "ログイン応答の安全確認に失敗しました".into(),
        ));
    }
    let stored = StoredSession { access_token };
    if let Err(error) = store_session(&stored) {
        if let Ok(logout_url) = api_endpoint(api_base_url, "v1/auth/logout") {
            let _ = client
                .post(logout_url)
                .bearer_auth(&stored.access_token)
                .timeout(Duration::from_secs(3))
                .send()
                .await;
        }
        return Err(error);
    }
    attach_avatar(api_base_url, client, &stored.access_token, &mut profile).await;
    Ok(profile)
}

async fn send_browser_auth_cancel(
    api_base_url: &str,
    client: &reqwest::Client,
    request_id: &str,
    verifier: &[u8],
) {
    let (Ok(url), Ok(code_verifier)) = (
        api_endpoint(api_base_url, "v1/auth/browser/cancel"),
        std::str::from_utf8(verifier),
    ) else {
        return;
    };
    let request = BrowserAuthPollRequest {
        request_id,
        code_verifier,
    };
    let _ = client
        .post(url)
        .json(&request)
        .timeout(Duration::from_secs(3))
        .send()
        .await;
}

async fn revoke_browser_auth_token(
    api_base_url: &str,
    client: &reqwest::Client,
    access_token: &str,
) {
    if let Ok(url) = api_endpoint(api_base_url, "v1/auth/logout") {
        let _ = client
            .post(url)
            .bearer_auth(access_token)
            .timeout(Duration::from_secs(3))
            .send()
            .await;
    }
}

fn clear_browser_start_if_current(client_attempt_id: &str, generation: u64) {
    if let Ok(mut state) = browser_auth_state().lock()
        && state.generation == generation
        && state.client_attempt_id.as_deref() == Some(client_attempt_id)
    {
        state.client_attempt_id = None;
        state.pending = None;
    }
}

fn reset_browser_poll(request_id: &str) {
    if let Ok(mut state) = browser_auth_state().lock()
        && let Some(attempt) = state.pending.as_mut()
        && attempt.request_id == request_id
    {
        attempt.polling = false;
    }
}

fn clear_browser_attempt(request_id: &str) {
    if let Ok(mut state) = browser_auth_state().lock()
        && state
            .pending
            .as_ref()
            .is_some_and(|attempt| attempt.request_id == request_id)
    {
        state.pending = None;
        state.client_attempt_id = None;
        state.generation = state.generation.wrapping_add(1);
    }
}

#[tauri::command]
pub async fn account_browser_auth_start(
    api_base_url: String,
    client_attempt_id: String,
    mode: String,
    locale: String,
    state: State<'_, AppState>,
) -> AppResult<BrowserAuthStart> {
    if !valid_browser_client_attempt_id(&client_attempt_id)
        || !matches!(mode.as_str(), "login" | "register")
        || !matches!(locale.as_str(), "ja" | "en")
    {
        return Err(AppError::Validation(
            "ログイン手続きの内容を確認できませんでした".into(),
        ));
    }
    let url = api_endpoint(&api_base_url, "v1/auth/browser/start")?;
    let (generation, previous) = {
        let mut browser = lock_browser_auth()?;
        browser.generation = browser.generation.wrapping_add(1);
        browser.client_attempt_id = Some(client_attempt_id.clone());
        (browser.generation, browser.pending.take())
    };
    if let Some(previous) = previous {
        send_browser_auth_cancel(
            &api_base_url,
            &state.client,
            &previous.request_id,
            &previous.verifier.0,
        )
        .await;
    }

    let verifier = random_browser_verifier();
    let challenge = browser_code_challenge(&verifier.0);
    let request = BrowserAuthStartRequest {
        code_challenge: &challenge,
        mode: &mode,
        locale: &locale,
    };
    let response = match state
        .client
        .post(url)
        .json(&request)
        .timeout(Duration::from_secs(20))
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => {
            clear_browser_start_if_current(&client_attempt_id, generation);
            return Err(network_error());
        }
    };
    let started: BrowserAuthStartResponse = match decode_response(response).await {
        Ok(started) => started,
        Err(error) => {
            clear_browser_start_if_current(&client_attempt_id, generation);
            return Err(error);
        }
    };
    if !valid_browser_request_id(&started.request_id)
        || !valid_browser_user_code(&started.user_code)
        || started.expires_in_seconds != BROWSER_AUTH_TTL.as_secs()
        || started.interval_seconds != 3
    {
        if valid_browser_request_id(&started.request_id) {
            send_browser_auth_cancel(
                &api_base_url,
                &state.client,
                &started.request_id,
                &verifier.0,
            )
            .await;
        }
        clear_browser_start_if_current(&client_attempt_id, generation);
        return Err(AppError::Other(
            "ログイン開始応答の安全確認に失敗しました".into(),
        ));
    }
    let browser_url = match validate_browser_auth_url(
        &started.browser_url,
        &started.request_id,
        &mode,
        &locale,
    ) {
        Ok(url) => url,
        Err(error) => {
            send_browser_auth_cancel(
                &api_base_url,
                &state.client,
                &started.request_id,
                &verifier.0,
            )
            .await;
            clear_browser_start_if_current(&client_attempt_id, generation);
            return Err(error);
        }
    };

    let mut attempt = Some(BrowserAuthAttempt {
        client_attempt_id: client_attempt_id.clone(),
        request_id: started.request_id.clone(),
        verifier,
        expires_at: Instant::now() + Duration::from_secs(started.expires_in_seconds),
        polling: false,
    });
    let installation = {
        match lock_browser_auth() {
            Ok(mut browser) => {
                let installed = browser.generation == generation
                    && browser.client_attempt_id.as_deref() == Some(client_attempt_id.as_str());
                if installed {
                    browser.pending = attempt.take();
                }
                Ok(installed)
            }
            Err(error) => Err(error),
        }
    };
    let installed = match installation {
        Ok(installed) => installed,
        Err(error) => {
            if let Some(attempt) = attempt {
                send_browser_auth_cancel(
                    &api_base_url,
                    &state.client,
                    &attempt.request_id,
                    &attempt.verifier.0,
                )
                .await;
            }
            return Err(error);
        }
    };
    if !installed {
        if let Some(attempt) = attempt {
            send_browser_auth_cancel(
                &api_base_url,
                &state.client,
                &attempt.request_id,
                &attempt.verifier.0,
            )
            .await;
        }
        return Err(AppError::Other(
            "ログイン手続きはキャンセルされました".into(),
        ));
    }

    Ok(BrowserAuthStart {
        browser_url: browser_url.into(),
        request_id: started.request_id,
        user_code: started.user_code,
        expires_in_seconds: started.expires_in_seconds,
        interval_seconds: started.interval_seconds,
    })
}

#[tauri::command]
pub async fn account_browser_auth_poll(
    api_base_url: String,
    request_id: String,
    state: State<'_, AppState>,
) -> AppResult<BrowserAuthPollResult> {
    if !valid_browser_request_id(&request_id) {
        return Err(AppError::Validation(
            "ログイン手続きの内容を確認できませんでした".into(),
        ));
    }
    let verifier = {
        let mut browser = lock_browser_auth()?;
        if browser
            .pending
            .as_ref()
            .is_some_and(|attempt| attempt.expires_at <= Instant::now())
        {
            browser.pending = None;
            browser.client_attempt_id = None;
            return Ok(BrowserAuthPollResult {
                status: "expired",
                account: None,
            });
        }
        let Some(attempt) = browser.pending.as_mut() else {
            return Err(AppError::Validation(
                "ログイン手続きは開始されていないか、キャンセルされました".into(),
            ));
        };
        if attempt.request_id != request_id {
            return Err(AppError::Validation(
                "別のログイン手続きが開始されました".into(),
            ));
        }
        if attempt.polling {
            return Ok(BrowserAuthPollResult {
                status: "pending",
                account: None,
            });
        }
        attempt.polling = true;
        BrowserAuthSecret(attempt.verifier.0.clone())
    };
    let code_verifier = match std::str::from_utf8(&verifier.0) {
        Ok(verifier) => verifier,
        Err(_) => {
            reset_browser_poll(&request_id);
            return Err(AppError::Other(
                "ログイン手続きの安全確認に失敗しました".into(),
            ));
        }
    };
    let url = match api_endpoint(&api_base_url, "v1/auth/browser/poll") {
        Ok(url) => url,
        Err(error) => {
            reset_browser_poll(&request_id);
            return Err(error);
        }
    };
    let request = BrowserAuthPollRequest {
        request_id: &request_id,
        code_verifier,
    };
    let response = match state
        .client
        .post(url)
        .json(&request)
        .timeout(Duration::from_secs(15))
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => {
            reset_browser_poll(&request_id);
            return Err(network_error());
        }
    };
    let status = response.status();
    let body = match response.bytes().await {
        Ok(body) => body,
        Err(_) => {
            reset_browser_poll(&request_id);
            return Err(AppError::Other(
                "アカウントサービスの応答を読み取れません".into(),
            ));
        }
    };
    if !status.is_success() {
        let error_code = serde_json::from_slice::<ApiError>(&body)
            .ok()
            .and_then(|error| error.error);
        if error_code.as_deref() == Some("BROWSER_AUTH_EXPIRED") {
            clear_browser_attempt(&request_id);
            return Ok(BrowserAuthPollResult {
                status: "expired",
                account: None,
            });
        }
        reset_browser_poll(&request_id);
        return Err(status_error(status, &body));
    }
    let response = match serde_json::from_slice::<BrowserAuthPollResponse>(&body) {
        Ok(response) => response,
        Err(_) => {
            reset_browser_poll(&request_id);
            return Err(AppError::Other(
                "アカウントサービスの応答形式が正しくありません".into(),
            ));
        }
    };
    if response.status == "pending" {
        reset_browser_poll(&request_id);
        return Ok(BrowserAuthPollResult {
            status: "pending",
            account: None,
        });
    }
    if response.status != "complete" {
        reset_browser_poll(&request_id);
        return Err(AppError::Other(
            "アカウントサービスの応答形式が正しくありません".into(),
        ));
    }
    let Some(access_token) = response.access_token else {
        clear_browser_attempt(&request_id);
        return Err(AppError::Other(
            "ログイン応答の安全確認に失敗しました".into(),
        ));
    };
    let token_is_valid =
        access_token.len() == 64 && access_token.bytes().all(|byte| byte.is_ascii_hexdigit());
    let Some(mut account) = response.account else {
        clear_browser_attempt(&request_id);
        if token_is_valid {
            revoke_browser_auth_token(&api_base_url, &state.client, &access_token).await;
        }
        return Err(AppError::Other(
            "ログイン応答の安全確認に失敗しました".into(),
        ));
    };
    if !token_is_valid {
        clear_browser_attempt(&request_id);
        return Err(AppError::Other(
            "ログイン応答の安全確認に失敗しました".into(),
        ));
    }
    let _server_expiry = response.expires_at;
    attach_avatar(&api_base_url, &state.client, &access_token, &mut account).await;

    enum CommitResult {
        Stored,
        Expired,
        CancelledOrReplaced,
        StoreFailed(AppError),
    }
    let stored = StoredSession {
        access_token: access_token.clone(),
    };
    let commit_result = {
        match lock_browser_auth() {
            Ok(mut browser) => {
                let active = browser.pending.as_ref().is_some_and(|attempt| {
                    attempt.request_id == request_id
                        && attempt.polling
                        && Some(attempt.client_attempt_id.as_str())
                            == browser.client_attempt_id.as_deref()
                });
                let commit = if !active {
                    CommitResult::CancelledOrReplaced
                } else if browser
                    .pending
                    .as_ref()
                    .is_some_and(|attempt| attempt.expires_at <= Instant::now())
                {
                    browser.pending = None;
                    browser.client_attempt_id = None;
                    CommitResult::Expired
                } else if let Some(attempt) = browser.pending.take() {
                    browser.client_attempt_id = None;
                    let save_result = store_session(&stored);
                    drop(attempt);
                    match save_result {
                        Ok(()) => CommitResult::Stored,
                        Err(error) => CommitResult::StoreFailed(error),
                    }
                } else {
                    CommitResult::CancelledOrReplaced
                };
                Ok(commit)
            }
            Err(error) => Err(error),
        }
    };
    let commit = match commit_result {
        Ok(commit) => commit,
        Err(error) => {
            revoke_browser_auth_token(&api_base_url, &state.client, &access_token).await;
            return Err(error);
        }
    };
    match commit {
        CommitResult::Stored => Ok(BrowserAuthPollResult {
            status: "complete",
            account: Some(account),
        }),
        CommitResult::Expired => {
            revoke_browser_auth_token(&api_base_url, &state.client, &access_token).await;
            Ok(BrowserAuthPollResult {
                status: "expired",
                account: None,
            })
        }
        CommitResult::CancelledOrReplaced => {
            revoke_browser_auth_token(&api_base_url, &state.client, &access_token).await;
            Ok(BrowserAuthPollResult {
                status: "pending",
                account: None,
            })
        }
        CommitResult::StoreFailed(error) => {
            revoke_browser_auth_token(&api_base_url, &state.client, &access_token).await;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn account_browser_auth_cancel(
    api_base_url: String,
    client_attempt_id: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    if !valid_browser_client_attempt_id(&client_attempt_id) {
        return Err(AppError::Validation(
            "ログイン手続きの内容を確認できませんでした".into(),
        ));
    }
    let attempt = {
        let mut browser = lock_browser_auth()?;
        if browser.client_attempt_id.as_deref() != Some(client_attempt_id.as_str()) {
            return Ok(());
        }
        browser.generation = browser.generation.wrapping_add(1);
        browser.client_attempt_id = None;
        browser.pending.take()
    };
    if let Some(attempt) = attempt {
        send_browser_auth_cancel(
            &api_base_url,
            &state.client,
            &attempt.request_id,
            &attempt.verifier.0,
        )
        .await;
    }
    Ok(())
}

#[tauri::command]
pub async fn account_password_login(
    api_base_url: String,
    email: String,
    password: String,
    state: State<'_, AppState>,
) -> AppResult<AccountPasswordChallenge> {
    let url = api_endpoint(&api_base_url, "v1/auth/password/login")?;
    let response = state
        .client
        .post(url)
        .json(&PasswordLoginRequest {
            email: &email,
            password: &password,
        })
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| network_error())?;
    let challenge: AccountPasswordChallenge = decode_response(response).await?;
    if !is_safe_opaque_token(&challenge.challenge_id) || challenge.expires_in_seconds == 0 {
        return Err(AppError::Other(
            "ログイン応答の安全確認に失敗しました".into(),
        ));
    }
    Ok(challenge)
}

#[tauri::command]
pub async fn account_verify_login_code(
    api_base_url: String,
    challenge_id: String,
    code: String,
    state: State<'_, AppState>,
) -> AppResult<AccountProfile> {
    if !is_safe_opaque_token(&challenge_id)
        || !code.bytes().all(|byte| byte.is_ascii_digit())
        || code.len() != 6
    {
        return Err(AppError::Validation(
            "6桁の確認コードを入力してください".into(),
        ));
    }
    let url = api_endpoint(&api_base_url, "v1/auth/password/verify-login-code")?;
    let response = state
        .client
        .post(url)
        .json(&LoginCodeRequest {
            challenge_id: &challenge_id,
            code: &code,
        })
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|_| network_error())?;
    let verified: VerifyResponse = decode_response(response).await?;
    finish_login(
        &api_base_url,
        verified.access_token,
        verified.account,
        &state.client,
    )
    .await
}

#[tauri::command]
pub async fn account_request_enrollment_code(
    api_base_url: String,
    email: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let url = api_endpoint(&api_base_url, "v1/auth/password/request-enrollment-code")?;
    let response = state
        .client
        .post(url)
        .json(&EnrollmentCodeRequest { email: &email })
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| network_error())?;
    let _: serde_json::Value = decode_response(response).await?;
    Ok(())
}

#[tauri::command]
pub async fn account_verify_enrollment_code(
    api_base_url: String,
    email: String,
    code: String,
    state: State<'_, AppState>,
) -> AppResult<AccountPasswordSetup> {
    let url = api_endpoint(&api_base_url, "v1/auth/password/verify-enrollment-code")?;
    let response = state
        .client
        .post(url)
        .json(&EnrollmentVerifyRequest {
            email: &email,
            code: &code,
        })
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|_| network_error())?;
    let setup: AccountPasswordSetup = decode_response(response).await?;
    if !is_safe_opaque_token(&setup.setup_token) || setup.expires_in_seconds == 0 {
        return Err(AppError::Other("確認応答の安全確認に失敗しました".into()));
    }
    Ok(setup)
}

#[tauri::command]
pub async fn account_enroll_password(
    api_base_url: String,
    email: String,
    setup_token: String,
    password: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    if !is_safe_opaque_token(&setup_token) {
        return Err(AppError::Validation(
            "メール確認から最初からやり直してください".into(),
        ));
    }
    let url = api_endpoint(&api_base_url, "v1/auth/password/enroll")?;
    let response = state
        .client
        .post(url)
        .json(&EnrollPasswordRequest {
            email: &email,
            setup_token: &setup_token,
            password: &password,
        })
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| network_error())?;
    let _: serde_json::Value = decode_response(response).await?;
    Ok(())
}

#[tauri::command]
pub async fn account_request_password_reset(
    api_base_url: String,
    email: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let (path, use_session) = if email.is_some() {
        ("v1/auth/password/request-reset", false)
    } else {
        ("v1/me/password-reset", true)
    };
    let url = api_endpoint(&api_base_url, path)?;
    let mut request = state.client.post(url).timeout(Duration::from_secs(20));
    if let Some(email) = email.as_deref() {
        request = request.json(&EmailRequest { email });
    }
    if use_session {
        let session = load_session()?.ok_or_else(|| {
            AppError::Validation("パスワード再設定の前にログインしてください".into())
        })?;
        request = request.bearer_auth(session.access_token);
    }
    let response = request.send().await.map_err(|_| network_error())?;
    let _: serde_json::Value = decode_response(response).await?;
    Ok(())
}

#[tauri::command]
pub async fn account_update_display_name(
    api_base_url: String,
    display_name: String,
    state: State<'_, AppState>,
) -> AppResult<AccountProfile> {
    let session = load_session()?
        .ok_or_else(|| AppError::Validation("表示名を変更するにはログインしてください".into()))?;
    let url = api_endpoint(&api_base_url, "v1/me/display-name")?;
    let response = state
        .client
        .patch(url)
        .bearer_auth(&session.access_token)
        .json(&DisplayNameRequest {
            display_name: &display_name,
        })
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|_| network_error())?;
    let mut profile: AccountProfile = decode_response(response).await?;
    attach_avatar(
        &api_base_url,
        &state.client,
        &session.access_token,
        &mut profile,
    )
    .await;
    Ok(profile)
}

#[tauri::command]
pub async fn account_upload_avatar(
    api_base_url: String,
    mime_type: String,
    data_base64: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let _ = decode_avatar(&mime_type, &data_base64)?;
    let session = load_session()?.ok_or_else(|| {
        AppError::Validation("プロフィール画像を変更するにはログインしてください".into())
    })?;
    let url = api_endpoint(&api_base_url, "v1/me/avatar")?;
    let response = state
        .client
        .put(url)
        .bearer_auth(&session.access_token)
        .json(&AvatarRequest {
            mime_type: &mime_type,
            data_base64: &data_base64,
        })
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| network_error())?;
    let _: serde_json::Value = decode_response(response).await?;
    Ok(())
}

#[tauri::command]
pub async fn account_remove_avatar(
    api_base_url: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let session = load_session()?.ok_or_else(|| {
        AppError::Validation("プロフィール画像を変更するにはログインしてください".into())
    })?;
    let url = api_endpoint(&api_base_url, "v1/me/avatar")?;
    let response = state
        .client
        .delete(url)
        .bearer_auth(&session.access_token)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|_| network_error())?;
    let _: serde_json::Value = decode_response(response).await?;
    Ok(())
}

#[tauri::command]
pub async fn account_request_code(
    api_base_url: String,
    email: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let url = api_endpoint(&api_base_url, "v1/auth/request-code")?;
    let response = state
        .client
        .post(url)
        .json(&EmailRequest { email: &email })
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| network_error())?;
    let _: serde_json::Value = decode_response(response).await?;
    Ok(())
}

#[tauri::command]
pub async fn account_verify_code(
    api_base_url: String,
    email: String,
    code: String,
    state: State<'_, AppState>,
) -> AppResult<AccountProfile> {
    let url = api_endpoint(&api_base_url, "v1/auth/verify-code")?;
    let response = state
        .client
        .post(url)
        .json(&CodeRequest {
            email: &email,
            code: &code,
        })
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|_| network_error())?;
    let verified: VerifyResponse = decode_response(response).await?;
    finish_login(
        &api_base_url,
        verified.access_token,
        verified.account,
        &state.client,
    )
    .await
}

#[tauri::command]
pub async fn account_load_session(
    api_base_url: String,
    state: State<'_, AppState>,
) -> AppResult<Option<AccountProfile>> {
    let Some(session) = load_session()? else {
        return Ok(None);
    };
    let url = api_endpoint(&api_base_url, "v1/me")?;
    let response = state
        .client
        .get(url)
        .bearer_auth(&session.access_token)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|_| network_error())?;
    if response.status() == StatusCode::UNAUTHORIZED {
        clear_session()?;
        return Ok(None);
    }
    let mut profile: AccountProfile = decode_response(response).await?;
    attach_avatar(
        &api_base_url,
        &state.client,
        &session.access_token,
        &mut profile,
    )
    .await;
    Ok(Some(profile))
}

#[tauri::command]
pub async fn account_logout(api_base_url: String, state: State<'_, AppState>) -> AppResult<()> {
    let session = load_session()?;
    let clear_result = clear_session();
    if let Some(session) = session {
        if let Ok(url) = api_endpoint(&api_base_url, "v1/auth/logout") {
            let _ = state
                .client
                .post(url)
                .bearer_auth(session.access_token)
                .timeout(Duration::from_secs(3))
                .send()
                .await;
        }
    }
    clear_result
}

#[cfg(test)]
mod tests {
    use super::{
        BROWSER_LOGIN_URL, BrowserAuthPollRequest, BrowserAuthPollResponse, api_endpoint,
        browser_code_challenge, random_browser_verifier, valid_browser_request_id,
        valid_browser_user_code, validate_browser_auth_url,
    };

    #[test]
    fn browser_verifier_and_challenge_are_native_only_hex_values() {
        let verifier = random_browser_verifier();
        let verifier_text = std::str::from_utf8(&verifier.0).unwrap();
        assert_eq!(verifier_text.len(), 64);
        assert!(
            verifier_text
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        );

        let challenge = browser_code_challenge(&verifier.0);
        assert_eq!(challenge.len(), 64);
        assert!(
            challenge
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        );
    }

    #[test]
    fn browser_poll_serializes_only_the_worker_code_verifier_field_name() {
        let verifier = "a".repeat(64);
        let request = BrowserAuthPollRequest {
            request_id: "0123456789abcdef0123456789abcdef",
            code_verifier: &verifier,
        };
        let json = serde_json::to_value(request).unwrap();
        assert_eq!(json["requestId"], "0123456789abcdef0123456789abcdef");
        assert_eq!(json["codeVerifier"], verifier);
        assert!(json.get("verifier").is_none());
    }

    #[test]
    fn browser_start_url_accepts_only_the_expected_page_and_handoff_parameters() {
        let request_id = "0123456789abcdef0123456789abcdef";
        let url = format!("{BROWSER_LOGIN_URL}?request={request_id}&mode=login&lang=ja");
        assert!(validate_browser_auth_url(&url, request_id, "login", "ja").is_ok());
        assert!(
            validate_browser_auth_url(
                &format!(
                    "{BROWSER_LOGIN_URL}?request={request_id}&mode=login&lang=ja&token=secret"
                ),
                request_id,
                "login",
                "ja"
            )
            .is_err()
        );
        assert!(
            validate_browser_auth_url(
                &format!(
                    "https://attacker.example/account.html?request={request_id}&mode=login&lang=ja"
                ),
                request_id,
                "login",
                "ja"
            )
            .is_err()
        );
    }

    #[test]
    fn validates_browser_request_ids_and_pairing_codes() {
        assert!(valid_browser_request_id("0123456789abcdef0123456789abcdef"));
        assert!(!valid_browser_request_id(
            "0123456789ABCDEF0123456789ABCDEF"
        ));
        assert!(valid_browser_user_code("2345-ABCD"));
        assert!(!valid_browser_user_code("01IO-ABCD"));
    }

    #[test]
    fn deserializes_worker_completion_with_numeric_expiry_and_camel_case_fields() {
        let response: BrowserAuthPollResponse = serde_json::from_str(
            r#"{"status":"complete","accessToken":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","expiresAt":1790800000000,"account":{"email":"player@example.com","displayName":"Player","hasPassword":true}}"#,
        )
        .unwrap();
        assert_eq!(response.status, "complete");
        let expected_access_token = "a".repeat(64);
        assert_eq!(
            response.access_token.as_deref(),
            Some(expected_access_token.as_str())
        );
        assert_eq!(
            response.expires_at.unwrap(),
            serde_json::json!(1790800000000u64)
        );
        assert_eq!(response.account.unwrap().email, "player@example.com");
    }

    #[test]
    fn api_endpoint_only_accepts_the_shared_service_host_or_debug_localhost() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../account-api.json")).unwrap();
        let configured_base = config["baseUrl"].as_str().unwrap();
        assert!(api_endpoint(configured_base, "v1/me").is_ok());
        assert!(api_endpoint("https://attacker.example", "v1/me").is_err());
        assert!(
            api_endpoint(
                "https://tomonode-account-api.rafaerunacaya27.workers.dev.evil.example",
                "v1/me"
            )
            .is_err()
        );
        assert!(
            api_endpoint(
                "https://tomonode-account-api.rafaerunacaya27.workers.dev/?token=bad",
                "v1/me"
            )
            .is_err()
        );
        if cfg!(debug_assertions) {
            assert!(api_endpoint("http://127.0.0.1:8787/", "health").is_ok());
        }
    }
}
