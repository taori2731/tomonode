//! Isolated component acceptance harness, compiled ONLY by cargo test.
//! No AppState, account login, database or Windows Credential Manager access.
use crate::{discord_notifications, membership, secure_secrets};
use serde::Deserialize;
use std::io::Read;
use zeroize::Zeroizing;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Input {
    api_base: String,
    pin: serde_json::Value,
    token: String,
    webhook: String,
    locale: String,
    mentions: serde_json::Value,
    confirmed: bool,
}

fn local_endpoint(base: &str) -> Option<reqwest::Url> {
    let url = reqwest::Url::parse(base).ok()?;
    (url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && url.path() == "/"
        && url.query().is_none()
        && url.fragment().is_none())
    .then(|| url.join("v1/membership/lease").ok())
    .flatten()
}

async fn execute(input: Input) -> serde_json::Value {
    let Some(endpoint) = local_endpoint(&input.api_base) else {
        return serde_json::json!({"result":"invalid_lab_endpoint"});
    };
    let token = Zeroizing::new(input.token);
    let webhook = Zeroizing::new(input.webhook);
    let Ok(client) = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(8))
        .build()
    else {
        return serde_json::json!({"result":"client_unavailable"});
    };
    let Ok(response) = client
        .get(endpoint)
        .bearer_auth(token.as_str())
        .send()
        .await
    else {
        return serde_json::json!({"result":"qualification_unavailable"});
    };
    if !response.status().is_success() {
        return serde_json::json!({"result":"qualification_required"});
    }
    let Ok(lease) = secure_secrets::bounded_json::<serde_json::Value>(response, 8192).await else {
        return serde_json::json!({"result":"invalid_qualification"});
    };
    let verified = membership::verify_lab_lease(&lease, &input.pin, &token, true);
    let release_rejects_test = !membership::verify_lab_lease(&lease, &input.pin, &token, false);
    if !verified || !release_rejects_test {
        return serde_json::json!({"result":"invalid_qualification"});
    }
    let mut result = discord_notifications::lab_notification(
        &webhook,
        &input.locale,
        input.mentions,
        input.confirmed,
        || membership::verify_lab_lease(&lease, &input.pin, &token, true),
    )
    .await;
    result["nativeVerified"] = serde_json::json!(true);
    result["releaseRejectsTest"] = serde_json::json!(true);
    result
}

#[tokio::test]
#[ignore = "isolated lab only; explicit per-message confirmation required for Discord HTTP"]
async fn isolated_native_probe() {
    let mut bytes = Zeroizing::new(Vec::new());
    let read = std::io::stdin().take(16385).read_to_end(&mut bytes);
    let result = if read.is_err() || bytes.len() > 16384 {
        serde_json::json!({"result":"invalid_input"})
    } else if let Ok(input) = serde_json::from_slice::<Input>(&bytes) {
        execute(input).await
    } else {
        serde_json::json!({"result":"invalid_input"})
    };
    // Fixed safe result only. Never print stdin, reqwest errors, tokens or URLs.
    println!("TOMONODE_LAB_RESULT:{}", result);
}

#[test]
fn lab_endpoint_is_loopback_only_without_redirect_or_credentials() {
    assert!(local_endpoint("http://127.0.0.1:1466/").is_some());
    for value in [
        "https://127.0.0.1:1466/",
        "http://localhost:1466/",
        "http://127.0.0.1/",
        "http://127.0.0.1:1466/path",
        "http://user@127.0.0.1:1466/",
        "http://127.0.0.1:1466/?key=x",
        "https://tomonode.site/",
    ] {
        assert!(local_endpoint(value).is_none());
    }
}
