use base64::{Engine, engine::general_purpose::STANDARD as BASE64_STANDARD};
use reqwest::{StatusCode, Url, header};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::time::Duration;
use tauri::State;

use crate::{
    AppState,
    error::{AppError, AppResult},
};

const CREDENTIAL_SERVICE: &str = "TomoNode Account Session";
const CREDENTIAL_ACCOUNT: &str = "current";

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
        "PASSWORD_REQUIREMENTS_NOT_MET" => "パスワードは15〜128文字で入力してください。",
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
    use super::api_endpoint;

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
