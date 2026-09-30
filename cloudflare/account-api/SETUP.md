# TomoNode account API: password authentication and profile data

## Firebase setup and deployment prerequisites

The Worker uses Firebase Authentication's REST API as the password verifier. Passwords are never stored in TomoNode D1. The configured Firebase project is `tomonode-auth` (project number `902281359382`); email/password is the only enabled provider for this flow.

1. In Firebase Authentication, keep Email/Password enabled and configure the project password policy to match the Worker: 6–128 Unicode code points and no more than 512 UTF-8 bytes. Do not enable email-link or social providers for this login flow unless a separate reviewed flow is added.
2. Enable Firebase email-enumeration protection. The Worker still normalizes bad credentials and unknown accounts to the same `INVALID_CREDENTIALS` response.
3. Restrict the Firebase Web API key to the Identity Toolkit API and configure authorized domains to include `tomonode.site`. The key is passed only from the Worker binding; do not add it to the desktop client or commit it to source control.
4. Before release, configure the Firebase Console password-reset email template's custom action handler URL as `https://tomonode.site/password-reset.html`. This is a manual Firebase Console setting; shipping the website file alone does not change Firebase's email links. The website build copies `website/public/password-reset.html` and its local JS/CSS to those exact paths. The handler accepts Firebase's `mode=resetPassword` and `oobCode`, then posts the new password to the Worker. Do not point the reset email at the SPA root or Firebase's default handler.
5. Configure the `FIREBASE_API_KEY` Worker secret from the Firebase Web app configuration. It is intentionally not in `wrangler.toml` or this document:

   ```powershell
   npx wrangler secret put FIREBASE_API_KEY
   ```

Existing `RESEND_API_KEY`, `RESEND_FROM`, `AUTH_CODE_PEPPER`, and `SESSION_PEPPER` bindings remain required. Use independent high-entropy random values for the two pepper secrets; never print them in logs or commits.

## Database migration and rollout

For a new environment, apply migrations `0002_password_auth.sql` and `0003_browser_auth.sql` to its D1 database before deploying the Worker:

```powershell
npx wrangler d1 migrations apply tomonode-accounts --remote
```

The migrations are additive: they retain existing account/session data and add Firebase account linkage, credential versions, display names, private avatar BLOB columns, login challenges, purpose-bound enrollment proofs, and short-lived browser authorization requests. Browser requests store only the user-facing pairing code plus its HMAC, the PKCE-style challenge HMAC, status, expiry, and (after consent) the account ID and credential version. They never store a desktop verifier or access token. A password login challenge holds the Firebase UID privately, but does not link it to a legacy account until the email code has been consumed; this keeps a password-only attempt from disabling the legacy email-code route. Linking increments the account credential version, so earlier sessions stop authenticating. A legacy 0.5.7 OTP verification can no longer create a session after that account has a Firebase UID; accounts that have not enrolled retain the old route temporarily so a staged desktop rollout does not lock them out. New clients must use the password-first endpoints only.

Password enrollment keeps the mailbox proof until Firebase creation and D1 linking both succeed. An active request leases that proof for at most two minutes. If Firebase creates the identity but D1 temporarily fails, retry the same enrollment with the same setup token and password before the ten-minute proof expires. When Firebase responds `EMAIL_EXISTS`, the Worker only attempts recovery by signing in with that submitted password while the same unexpired email proof is held. It does not delete Firebase identities. If recovery sign-in fails, use the password-reset flow for an account that already has a password.

Password reset first validates Firebase's one-use action code, revokes TomoNode sessions in D1, and then asks Firebase to commit the new password. This order avoids leaving TomoNode sessions valid if Firebase accepts the reset after D1 becomes unavailable. If the D1 revocation step fails, the password change is not submitted to Firebase.

The account API Worker revision `c5052ac2` is deployed, and migration `0003_browser_auth.sql` has been applied to its D1 database. Before releasing matching desktop and website clients, confirm the Firebase project settings, Worker secrets, Resend sender, reset handler asset, and client behavior are ready. A Worker deployment and migration do not by themselves establish end-to-end client acceptance.

## API contract

All JSON responses are `no-store`. The login-code verification endpoint issues a web session after a Firebase password check and the second, email-delivered code. The browser authorization poll endpoint can issue a native-client session only after that web session explicitly approves its matching pairing code and PKCE-style proof.

| Method and path | Authentication | Request | Success |
| --- | --- | --- | --- |
| `POST /v1/auth/password/login` | none | `{email,password}` | `202 {challengeId,expiresInSeconds}`; the email code is sent only after Firebase accepts the password |
| `POST /v1/auth/password/verify-login-code` | none | `{challengeId,code}` | `200 {accessToken,expiresAt,account:{email,displayName,hasPassword}}` |
| `POST /v1/auth/password/request-enrollment-code` | none | `{email}` | Generic `202 {sent,expiresInSeconds}` |
| `POST /v1/auth/password/verify-enrollment-code` | none | `{email,code}` | `200 {setupToken,expiresInSeconds}`; this is not a session |
| `POST /v1/auth/password/enroll` | none | `{email,setupToken,password}` | `200 {passwordSet:true}`; this is not a session |
| `POST /v1/auth/password/request-reset` | none | `{email}` | Enumeration-safe `202 {requested:true}` |
| `POST /v1/me/password-reset` | Bearer session | `{}` | Fresh Firebase reset email for the signed-in account, `202 {requested:true}` |
| `POST /v1/auth/password/complete-reset` | Firebase action code | `{oobCode,newPassword}` | `200 {passwordChanged:true}` and all TomoNode sessions/challenges for the account are revoked |
| `POST /v1/auth/browser/start` | none; native client | `{codeChallenge,mode,locale}` | `200 {requestId,userCode,browserUrl,expiresInSeconds,intervalSeconds}`; `codeChallenge` is lowercase SHA-256 hex of a 64-character lowercase hex verifier |
| `GET /v1/auth/browser/request?requestId=...` | none; account page | — | `200 {userCode,expiresInSeconds,status}`; contains no account identity |
| `POST /v1/auth/browser/approve` | Bearer password+email-code session created within the last 10 minutes | `{requestId,userCode}` | `200 {approved:true}` and the approving web session is revoked |
| `POST /v1/auth/browser/poll` | native client proof | `{requestId,codeVerifier}` | `202 {status:"pending"}` or one-time `200 {status:"complete",accessToken,expiresAt,account}` after matching approval |
| `POST /v1/auth/browser/cancel` | native client proof | `{requestId,codeVerifier}` | `200 {cancelled:true}`; deletes only the matching unexpired request |
| `GET /v1/me` | Bearer session | — | `{email,displayName,hasPassword}` |
| `PATCH /v1/me/display-name` | Bearer session | `{displayName}` | Updated profile |
| `GET /v1/me/avatar` | Bearer session | — | Authenticated image bytes (`image/png`, `image/jpeg`, or `image/webp`); `404` when absent |
| `PUT /v1/me/avatar` | Bearer session | `{mimeType,dataBase64}` | `200 {updated:true}` |
| `DELETE /v1/me/avatar` | Bearer session | — | `200 {deleted:true}` |

Password login, enrollment, and reset enforce 6–128 Unicode code points and at most 512 UTF-8 bytes, matching the configured Firebase project policy. Wrong, unknown, or unenrolled credentials all return `401 {error:"INVALID_CREDENTIALS"}` and do not send a login code. Enrollment/reset request responses do not identify whether an email has a password. Enrollment proof and login code are separate purpose-bound records, expire after 10 minutes, allow at most five guesses, and are single-use. Password reset is proven by Firebase's one-use email action code, never by a long-lived TomoNode session alone.

The native browser authorization flow keeps the verifier only in the desktop process. It starts a 10-minute request with a random 64-character hex verifier and its SHA-256 challenge, opens the returned TomoNode `account.html` URL, and polls every three seconds. The account page reads the short-lived pairing code, asks the signed-in user to compare it with the code shown in the desktop app, and requires an explicit approval action. Approval accepts only a current session from a password login plus its email code, created no more than 10 minutes earlier; approval captures that account and credential version, then revokes the web session. A later credential change invalidates the pending desktop grant. Polling is limited to once every three seconds per request, so other clients behind the same IP address do not share a polling quota. The account page CORS allowlist is the exact origin from `APP_BASE_URL`; it covers password login/code/enrollment/reset, browser request/approval, and logout routes. Native start, poll, and cancel calls do not require a browser `Origin` header.

## Profile privacy and data limits

- The display/account name is separate from the Minecraft username; duplicate display names are allowed. It is trimmed, 1–32 Unicode code points, and control characters are rejected.
- One custom avatar is stored per account as a D1 BLOB; no public URL or third-party image host is created. The authenticated avatar endpoint is separate from `/v1/me`, returns `private, no-store`, and requires the user's Bearer session on every read.
- Persisted avatar size is at most 128 KiB. Only PNG, JPEG, and WebP raster containers are accepted; SVG/unknown formats, oversized dimensions (over 1024×1024 or one megapixel), animated PNG/WebP, and common EXIF/XMP metadata are rejected. The desktop client should accept at most a 5 MiB source file, resize/re-encode with canvas to a square image, strip EXIF by re-encoding, and send the resulting MIME and prefixless Base64. The Worker independently checks Base64, container signature, image chunk/frame structure, dimensions, and persisted byte limit.
- Upload, read, and delete endpoints are private account APIs. Remove an avatar with `DELETE /v1/me/avatar`; no avatar is fetched during frequent profile/session checks.
- Never log passwords, setup tokens, email codes, Firebase action codes, Firebase ID/refresh tokens, or avatar Base64. Firebase provider ID/refresh tokens are intentionally discarded and never returned to the client.

## Local checks

Run `npm run typecheck` and `npm test` from `cloudflare/account-api`. The test script runs the Vitest suite and then `node --test integration/browser-auth-sqlite.node.mjs`; the latter applies migrations 0001–0003 to an in-memory SQLite database and exercises the browser authorization SQL without connecting to a D1 database. It uses Node's built-in `node:sqlite` module. Keep the `.node.mjs` suffix so workspace-wide Vitest discovery does not treat this `node:test` file as a Vitest test.
