//! One native authority for registration, appearance, previews and notifications.
//! Only a pinned server signature + current Credential Manager session grant paid rights.
use crate::membership_verifier::{Claims, Pin, SignedLease, session_binding};
use crate::{
    AppState, account_auth,
    error::{AppError, AppResult},
    secure_secrets,
};
#[cfg(test)]
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::State;

pub const FREE_LIMIT: usize = 3;
const LEASE_SERVICE: &str = "TomoNode Membership Lease";
const PREF_SERVICE: &str = "TomoNode Membership Preferences";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Persisted {
    lease: SignedLease,
    last_seen: i64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MembershipView {
    pub plan: String,
    pub state: String,
    pub registered_count: usize,
    pub server_limit: Option<usize>,
    pub expires_at: Option<i64>,
    pub paid_until: Option<i64>,
    pub cancel_at_period_end: bool,
    pub theme: Option<String>,
    pub preview_opt_in: bool,
    pub billing_enabled: bool,
}
impl MembershipView {
    pub(crate) fn free(state: &str) -> Self {
        Self {
            plan: "free".into(),
            state: state.into(),
            registered_count: 0,
            server_limit: Some(FREE_LIMIT),
            expires_at: None,
            paid_until: None,
            cancel_at_period_end: false,
            theme: None,
            preview_opt_in: false,
            billing_enabled: false,
        }
    }
    pub fn supporter(&self) -> bool {
        self.plan == "supporter"
            && self
                .expires_at
                .is_none_or(|until| until > chrono::Utc::now().timestamp_millis())
    }
}
#[derive(Default)]
pub struct MembershipService {
    cached: Mutex<Option<Persisted>>,
    last_refresh: Mutex<Option<Instant>>,
    refresh_lock: tokio::sync::Mutex<()>,
    clock: Mutex<Option<(i64, Instant)>>,
    connection: Mutex<String>,
    subject: Mutex<Option<String>>,
    session: Mutex<Option<String>>,
    free_state: Mutex<String>,
}

fn invalid() -> AppError {
    AppError::Validation("会員資格の署名・期限を確認できません".into())
}
// Preparation is not a network failure, nor evidence of paid membership.
// Only the fixed API's exact bounded 503 response may select this state.
fn failed_connection(status: u16, body: Option<&serde_json::Value>) -> &'static str {
    if status == 503
        && body
            .and_then(|v| v.get("error"))
            .and_then(serde_json::Value::as_str)
            == Some("BILLING_NOT_CONFIGURED")
    {
        "not_configured"
    } else {
        "offline"
    }
}
fn unqualified_state<'a>(connection: &'a str, reason: &'a str) -> &'a str {
    match connection {
        "not_configured" => "not_configured",
        "offline" => "unavailable",
        _ if reason.is_empty() => "free",
        _ => reason,
    }
}
fn qualified_connection(connection: &str) -> &str {
    // A valid signed, unexpired cache remains usable when billing is paused.
    // Do not display a paused server as fresh verification or extend its lease.
    if connection == "not_configured" {
        "offline"
    } else {
        connection
    }
}
fn verify(
    lease: &SignedLease,
    token: &str,
    now: i64,
    pin: &Pin,
    allow_test: bool,
) -> AppResult<Claims> {
    crate::membership_verifier::verify(lease, token, now, pin, allow_test).map_err(|_| invalid())
}

// Only the isolated test runner can supply an ephemeral pin. This is absent
// from desktop builds and never reads or writes the real account/keyring.
#[cfg(test)]
pub(crate) fn verify_lab_lease(
    lease: &serde_json::Value,
    pin: &serde_json::Value,
    token: &str,
    allow_test: bool,
) -> bool {
    let (Ok(lease), Ok(pin)) = (
        serde_json::from_value::<SignedLease>(lease.clone()),
        serde_json::from_value::<Pin>(pin.clone()),
    ) else {
        return false;
    };
    verify(
        &lease,
        token,
        chrono::Utc::now().timestamp(),
        &pin,
        allow_test,
    )
    .is_ok()
}
impl MembershipService {
    pub(crate) async fn revoke_current_session(&self, token: &str) -> AppResult<()> {
        // An older lease fetch must finish before the held account is cleared.
        let _refresh = self.refresh_lock.lock().await;
        if account_auth::membership_session_token()?.as_deref() != Some(token) {
            return Err(invalid());
        }
        self.clear()
    }

    pub fn clear(&self) -> AppResult<()> {
        *self.cached.lock().unwrap() = None;
        *self.last_refresh.lock().unwrap() = None;
        *self.subject.lock().unwrap() = None;
        self.free_state.lock().unwrap().clear();
        self.connection.lock().unwrap().clear();
        secure_secrets::delete(LEASE_SERVICE, "current")
    }
    fn now(&self) -> i64 {
        let wall = chrono::Utc::now().timestamp();
        let mut clock = self.clock.lock().unwrap();
        let effective = clock.as_ref().map_or(wall, |(anchor, instant)| {
            wall.max(anchor + instant.elapsed().as_secs() as i64)
        });
        *clock = Some((effective, Instant::now()));
        effective
    }
    pub async fn view(&self, client: &reqwest::Client, force: bool) -> AppResult<MembershipView> {
        let _refresh = self.refresh_lock.lock().await;
        let Some(token) = account_auth::membership_session_token()? else {
            self.clear()?;
            return Ok(MembershipView::free("signed_out"));
        };
        let binding = session_binding(&token);
        let previous = self.session.lock().unwrap().clone();
        if previous.as_ref().is_some_and(|old| old != &binding) {
            self.clear()?;
        }
        *self.session.lock().unwrap() = Some(binding);
        let now = self.now();
        let pin: Pin = serde_json::from_str(include_str!("../../membership-public-key.json"))?;
        if pin.public_key.is_empty() {
            return Ok(MembershipView::free("not_configured"));
        }
        if self.cached.lock().unwrap().is_none() {
            if let Some(value) = secure_secrets::read(LEASE_SERVICE, "current")? {
                *self.cached.lock().unwrap() = serde_json::from_str(&value).ok();
            }
        }
        let mut connection = self.connection.lock().unwrap().clone();
        if connection.is_empty() {
            connection = "verified".into();
        }
        let refresh_due = force
            || self
                .last_refresh
                .lock()
                .unwrap()
                .is_none_or(|last| last.elapsed() >= Duration::from_secs(300));
        if refresh_due {
            *self.last_refresh.lock().unwrap() = Some(Instant::now());
            let config: serde_json::Value =
                serde_json::from_str(include_str!("../../account-api.json"))?;
            let endpoint = account_auth::membership_api_endpoint(
                config["baseUrl"].as_str().unwrap_or_default(),
            )?;
            let response = client
                .get(endpoint)
                .bearer_auth(&token)
                .timeout(Duration::from_secs(8))
                .send()
                .await;
            match response {
                Ok(response) if response.status().is_success() => {
                    let result =
                        crate::secure_secrets::bounded_json::<SignedLease>(response, 8192).await;
                    match result {
                        Ok(lease)
                            if verify(&lease, &token, now, &pin, cfg!(debug_assertions))
                                .is_ok() =>
                        {
                            let stored = Persisted {
                                lease,
                                last_seen: now,
                            };
                            secure_secrets::write(
                                LEASE_SERVICE,
                                "current",
                                &serde_json::to_string(&stored)?,
                            )?;
                            *self.cached.lock().unwrap() = Some(stored);
                            connection = "verified".into();
                        }
                        _ => {
                            self.clear()?;
                            return Ok(MembershipView::free("invalid_qualification"));
                        }
                    }
                }
                Ok(response) if matches!(response.status().as_u16(), 401 | 403) => {
                    let unauthorized = response.status().as_u16() == 401;
                    let reason =
                        crate::secure_secrets::bounded_json::<serde_json::Value>(response, 4096)
                            .await
                            .ok()
                            .and_then(|v| v["state"].as_str().map(str::to_owned))
                            .filter(|v| {
                                ["past_due", "unpaid", "canceled", "expired", "free"]
                                    .contains(&v.as_str())
                            })
                            .unwrap_or_else(|| "free".into());
                    self.clear()?;
                    *self.last_refresh.lock().unwrap() = Some(Instant::now());
                    *self.free_state.lock().unwrap() = if unauthorized {
                        "session_expired".into()
                    } else {
                        reason.clone()
                    };
                    return Ok(MembershipView::free(if unauthorized {
                        "session_expired"
                    } else {
                        &reason
                    }));
                }
                Ok(response) if response.status().as_u16() == 503 => {
                    let body = secure_secrets::bounded_json::<serde_json::Value>(response, 4096)
                        .await
                        .ok();
                    connection = failed_connection(503, body.as_ref()).into();
                }
                _ => connection = "offline".into(),
            }
            *self.connection.lock().unwrap() = connection.clone();
        }
        let cached = self.cached.lock().unwrap().clone();
        let Some(mut stored) = cached else {
            let reason = self.free_state.lock().unwrap().clone();
            return Ok(MembershipView::free(unqualified_state(
                &connection,
                &reason,
            )));
        };
        if account_auth::membership_session_token()?.as_deref() != Some(&token) {
            self.clear()?;
            return Ok(MembershipView::free("session_expired"));
        }
        // Network I/O may cross the signed expiry; use a fresh monotonic time.
        let now = self.now();
        // Credential Manager timestamp rejects rollback across process restarts.
        if now + 60 < stored.last_seen {
            self.clear()?;
            return Ok(MembershipView::free("clock_invalid"));
        }
        let Ok(claims) = verify(
            &stored.lease,
            &token,
            now.max(stored.last_seen),
            &pin,
            cfg!(debug_assertions),
        ) else {
            self.clear()?;
            return Ok(MembershipView::free("expired"));
        };
        if now - stored.last_seen >= 60 {
            stored.last_seen = now;
            secure_secrets::write(LEASE_SERVICE, "current", &serde_json::to_string(&stored)?)?;
            *self.cached.lock().unwrap() = Some(stored);
        }
        *self.subject.lock().unwrap() = Some(claims.subject.clone());
        let theme = secure_secrets::read(PREF_SERVICE, &format!("{}:theme", claims.subject))?
            .filter(|value| ["midnight", "orchid", "ember"].contains(&value.as_str()));
        let preview_opt_in =
            secure_secrets::read(PREF_SERVICE, &format!("{}:preview", claims.subject))?.as_deref()
                == Some("on");
        Ok(MembershipView {
            plan: "supporter".into(),
            state: qualified_connection(&connection).into(),
            registered_count: 0,
            server_limit: None,
            expires_at: Some(claims.expires_at * 1000),
            paid_until: Some(claims.paid_until * 1000),
            cancel_at_period_end: claims.cancel_at_period_end,
            theme,
            preview_opt_in,
            billing_enabled: false,
        })
    }
}
pub fn ensure_registration(count: usize, membership: &MembershipView) -> AppResult<()> {
    if !membership.supporter() && count >= FREE_LIMIT {
        return Err(AppError::Validation(format!(
            "FREE_SERVER_LIMIT: Freeプランでは3個まで管理できます（現在{count}個）。既存サーバーは引き続き利用できます。応援プランは準備中です"
        )));
    }
    Ok(())
}
#[tauri::command]
pub async fn membership_status(
    force: bool,
    state: State<'_, AppState>,
) -> AppResult<MembershipView> {
    let mut view = state.membership.view(&state.client, force).await?;
    view.registered_count = state.store.lock().unwrap().list_servers()?.len();
    Ok(view)
}
#[tauri::command]
pub async fn membership_set_theme(
    theme: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<MembershipView> {
    if let Some(ref theme) = theme {
        if !["midnight", "orchid", "ember"].contains(&theme.as_str()) {
            return Err(invalid());
        }
        require_supporter(&state).await?;
        let subject = state
            .membership
            .subject
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(invalid)?;
        secure_secrets::write(PREF_SERVICE, &format!("{subject}:theme"), theme)?;
        secure_secrets::write(PREF_SERVICE, &format!("{subject}:last-theme"), theme)?;
    } else {
        if let Some(subject) = state.membership.subject.lock().unwrap().clone() {
            secure_secrets::write(PREF_SERVICE, &format!("{subject}:theme"), "standard")?;
        }
    }
    membership_status(false, state).await
}
#[tauri::command]
pub async fn membership_set_preview(
    enabled: bool,
    state: State<'_, AppState>,
) -> AppResult<MembershipView> {
    if enabled {
        require_supporter(&state).await?;
    }
    if let Some(subject) = state.membership.subject.lock().unwrap().clone() {
        secure_secrets::write(
            PREF_SERVICE,
            &format!("{subject}:preview"),
            if enabled { "on" } else { "off" },
        )?;
    }
    membership_status(false, state).await
}
pub async fn require_supporter(state: &AppState) -> AppResult<()> {
    if !state
        .membership
        .view(&state.client, false)
        .await?
        .supporter()
    {
        return Err(AppError::Validation(
            "Supporter資格が必要です。応援プランの本番受付は準備中です".into(),
        ));
    }
    Ok(())
}

#[derive(Deserialize)]
struct PreviewFeature {
    id: String,
    public: bool,
}
fn feature_allowed(public: bool, member: &MembershipView) -> bool {
    public || (member.supporter() && member.preview_opt_in)
}
// Unknown feature IDs fail closed. Future native feature commands must call
// this gate too; the shared registry currently has no reviewed candidates.
#[tauri::command]
pub async fn membership_feature_available(
    feature_id: String,
    state: State<'_, AppState>,
) -> AppResult<bool> {
    let features: Vec<PreviewFeature> =
        serde_json::from_str(include_str!("../../preview-features.json"))?;
    let Some(feature) = features.iter().find(|feature| feature.id == feature_id) else {
        return Ok(false);
    };
    if feature.public {
        return Ok(true);
    }
    let member = state.membership.view(&state.client, false).await?;
    Ok(feature_allowed(false, &member))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    #[test]
    fn billing_preparation_requires_the_exact_service_unavailable_response() {
        let prepared = serde_json::json!({"error":"BILLING_NOT_CONFIGURED"});
        assert_eq!(failed_connection(503, Some(&prepared)), "not_configured");
        for status in [200, 401, 403, 429, 500, 502, 504] {
            assert_eq!(failed_connection(status, Some(&prepared)), "offline");
        }
        for body in [
            serde_json::json!({"error":"BILLING_UNAVAILABLE"}),
            serde_json::json!({"state":"not_configured"}),
            serde_json::json!({"error":true}),
            serde_json::json!(null),
        ] {
            assert_eq!(failed_connection(503, Some(&body)), "offline");
        }
        assert_eq!(failed_connection(503, None), "offline");
    }
    #[test]
    fn preparation_without_signed_qualification_does_not_grant_benefits() {
        let view = MembershipView::free(unqualified_state("not_configured", "free"));
        assert_eq!(view.state, "not_configured");
        assert!(!view.supporter());
        assert_eq!(view.server_limit, Some(3));
        assert_eq!(
            unqualified_state("offline", "not_configured"),
            "unavailable"
        );
        assert_eq!(unqualified_state("verified", "past_due"), "past_due");
        assert_eq!(unqualified_state("verified", ""), "free");
    }
    #[test]
    fn paused_billing_preserves_only_the_existing_unexpired_signed_cache() {
        assert_eq!(qualified_connection("not_configured"), "offline");
        assert_eq!(qualified_connection("verified"), "verified");
        let (lease, pin) = fixture();
        assert!(verify(&lease, "token", 1500, &pin, false).is_ok());
        assert!(verify(&lease, "token", 2000, &pin, false).is_err());
        assert!(verify(&lease, "other-session", 1500, &pin, false).is_err());
    }
    #[test]
    fn preview_opt_in_is_paid_and_public_release_remains_free() {
        let mut view = MembershipView::free("free");
        assert!(feature_allowed(true, &view));
        assert!(!feature_allowed(false, &view));
        view.plan = "supporter".into();
        assert!(!feature_allowed(false, &view));
        view.preview_opt_in = true;
        assert!(feature_allowed(false, &view));
        view.plan = "free".into();
        assert!(!feature_allowed(false, &view));
        let registry: Vec<PreviewFeature> =
            serde_json::from_str(include_str!("../../preview-features.json")).unwrap();
        assert!(registry.is_empty());
    }
    fn fixture() -> (SignedLease, Pin) {
        let key = SigningKey::from_bytes(&[7; 32]);
        let message = serde_json::to_vec(&serde_json::json!({"audience":"tomonode-desktop","subject":"account-1","sessionBinding":session_binding("token"),"plan":"supporter","mode":"live","issuedAt":1000,"expiresAt":2000,"paidUntil":3000,"cancelAtPeriodEnd":true})).unwrap();
        (
            SignedLease {
                payload: URL_SAFE_NO_PAD.encode(&message),
                signature: URL_SAFE_NO_PAD.encode(key.sign(&message).to_bytes()),
                key_id: "test".into(),
            },
            Pin {
                key_id: "test".into(),
                public_key: URL_SAFE_NO_PAD.encode(key.verifying_key().to_bytes()),
            },
        )
    }
    #[test]
    fn signature_binding_and_expiry_are_not_local_flags() {
        let (lease, pin) = fixture();
        assert!(
            verify(&lease, "token", 1500, &pin, false)
                .unwrap()
                .cancel_at_period_end
        );
        assert!(verify(&lease, "other-session", 1500, &pin, false).is_err());
        assert!(verify(&lease, "token", 2000, &pin, false).is_err());
        let mut changed = lease.clone();
        changed.payload.push('A');
        assert!(verify(&changed, "token", 1500, &pin, false).is_err());
    }
    #[test]
    fn signed_wrong_audience_mode_duration_or_paid_end_cannot_grant_privileges() {
        let (lease, pin) = fixture();
        let key = SigningKey::from_bytes(&[7; 32]);
        for (field, value) in [
            ("audience", serde_json::json!("another-app")),
            ("mode", serde_json::json!("test")),
            ("expiresAt", serde_json::json!(90000)),
            ("paidUntil", serde_json::json!(1999)),
            ("issuedAt", serde_json::json!(1800)),
        ] {
            let mut claims: serde_json::Value =
                serde_json::from_slice(&URL_SAFE_NO_PAD.decode(&lease.payload).unwrap()).unwrap();
            claims[field] = value;
            let message = serde_json::to_vec(&claims).unwrap();
            let changed = SignedLease {
                payload: URL_SAFE_NO_PAD.encode(&message),
                signature: URL_SAFE_NO_PAD.encode(key.sign(&message).to_bytes()),
                key_id: lease.key_id.clone(),
            };
            assert!(verify(&changed, "token", 1500, &pin, false).is_err());
        }
    }
    #[test]
    fn free_limit_including_grandfathered_users_only_blocks_additions() {
        for count in 0..7 {
            assert_eq!(
                ensure_registration(count, &MembershipView::free("free")).is_ok(),
                count < 3
            );
        }
        let mut supporter = MembershipView::free("verified");
        supporter.plan = "supporter".into();
        assert!(ensure_registration(500, &supporter).is_ok());
    }
}
