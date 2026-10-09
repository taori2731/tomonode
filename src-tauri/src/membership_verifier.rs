//! Pure verification shared by production and the separate offline GUI harness.
//! This module has no network, credentials, persistence or feature grants.
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SignedLease {
    pub(crate) payload: String,
    pub(crate) signature: String,
    pub(crate) key_id: String,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Claims {
    pub(crate) audience: String,
    pub(crate) subject: String,
    pub(crate) session_binding: String,
    pub(crate) plan: String,
    pub(crate) mode: String,
    pub(crate) issued_at: i64,
    pub(crate) expires_at: i64,
    pub(crate) paid_until: i64,
    pub(crate) cancel_at_period_end: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Pin {
    pub(crate) public_key: String,
    pub(crate) key_id: String,
}
pub(crate) fn session_binding(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}
pub(crate) fn verify(
    lease: &SignedLease,
    token: &str,
    now: i64,
    pin: &Pin,
    allow_test: bool,
) -> Result<Claims, ()> {
    if lease.key_id != pin.key_id || lease.payload.len() > 4096 {
        return Err(());
    }
    let key: [u8; 32] = URL_SAFE_NO_PAD
        .decode(&pin.public_key)
        .map_err(|_| ())?
        .try_into()
        .map_err(|_| ())?;
    let signature =
        Signature::from_slice(&URL_SAFE_NO_PAD.decode(&lease.signature).map_err(|_| ())?)
            .map_err(|_| ())?;
    let message = URL_SAFE_NO_PAD.decode(&lease.payload).map_err(|_| ())?;
    VerifyingKey::from_bytes(&key)
        .map_err(|_| ())?
        .verify_strict(&message, &signature)
        .map_err(|_| ())?;
    let claims: Claims = serde_json::from_slice(&message).map_err(|_| ())?;
    if claims.audience != "tomonode-desktop"
        || claims.subject.is_empty()
        || claims.plan != "supporter"
        || claims.session_binding != session_binding(token)
        || !(claims.mode == "live" || (allow_test && claims.mode == "test"))
        || claims.issued_at > now + 60
        || claims.expires_at <= now
        || claims.paid_until <= now
        || claims.expires_at > claims.paid_until
        || claims.expires_at <= claims.issued_at
        || claims.expires_at - claims.issued_at > 86_400
    {
        return Err(());
    }
    Ok(claims)
}
