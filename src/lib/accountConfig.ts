import accountApi from "../../account-api.json";

// This public endpoint is shared with Rust's exact-host allowlist in account_auth.rs.
// Deploy and verify the Worker at this URL before enabling account sign-in in a release.
export const ACCOUNT_API_BASE_URL = accountApi.baseUrl;
