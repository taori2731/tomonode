//! Never send these values to React, logs, or diagnostic exports.
use crate::error::{AppError, AppResult};

pub async fn bounded_json<T: serde::de::DeserializeOwned>(
    mut response: reqwest::Response,
    limit: usize,
) -> AppResult<T> {
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| AppError::Other("応答を確認できません".into()))?
    {
        if bytes.len() + chunk.len() > limit {
            return Err(AppError::Validation(
                "応答サイズが上限を超えています".into(),
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| AppError::Validation("応答形式を確認できません".into()))
}

#[cfg(all(windows, not(test)))]
pub fn read(service: &str, account: &str) -> AppResult<Option<String>> {
    let entry = keyring::Entry::new(service, account).map_err(|_| error())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(error()),
    }
}
#[cfg(all(windows, not(test)))]
pub fn write(service: &str, account: &str, value: &str) -> AppResult<()> {
    keyring::Entry::new(service, account)
        .map_err(|_| error())?
        .set_password(value)
        .map_err(|_| error())
}
#[cfg(all(windows, not(test)))]
pub fn delete(service: &str, account: &str) -> AppResult<()> {
    let entry = keyring::Entry::new(service, account).map_err(|_| error())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(error()),
    }
}
#[cfg(not(windows))]
fn error() -> AppError {
    AppError::Other("秘密情報の保存はWindows版で利用できます".into())
}
#[cfg(windows)]
fn error() -> AppError {
    AppError::Other("Windows資格情報マネージャーの操作に失敗しました".into())
}
#[cfg(all(not(windows), not(test)))]
pub fn read(_: &str, _: &str) -> AppResult<Option<String>> {
    Ok(None)
}
#[cfg(all(not(windows), not(test)))]
pub fn write(_: &str, _: &str, _: &str) -> AppResult<()> {
    Err(error())
}
#[cfg(all(not(windows), not(test)))]
pub fn delete(_: &str, _: &str) -> AppResult<()> {
    Ok(())
}

// Test-only memory store, not reachable in development or release binaries.
#[cfg(test)]
fn values() -> &'static std::sync::Mutex<std::collections::HashMap<String, String>> {
    static VALUES: std::sync::OnceLock<
        std::sync::Mutex<std::collections::HashMap<String, String>>,
    > = std::sync::OnceLock::new();
    VALUES.get_or_init(Default::default)
}
#[cfg(test)]
pub fn read(service: &str, account: &str) -> AppResult<Option<String>> {
    Ok(values()
        .lock()
        .unwrap()
        .get(&format!("{service}\0{account}"))
        .cloned())
}
#[cfg(test)]
pub fn write(service: &str, account: &str, value: &str) -> AppResult<()> {
    values()
        .lock()
        .unwrap()
        .insert(format!("{service}\0{account}"), value.into());
    Ok(())
}
#[cfg(test)]
pub fn delete(service: &str, account: &str) -> AppResult<()> {
    values()
        .lock()
        .unwrap()
        .remove(&format!("{service}\0{account}"));
    Ok(())
}
