# TomoNode account API: password authentication and profile data

## Firebase setup (do not deploy until complete)

The Worker uses Firebase Authentication's REST API as the password verifier. Passwords are never stored in TomoNode D1. The configured Firebase project is `tomonode-auth` (project number `902281359382`); email/password is the only enabled provider for this flow.

1. In Firebase Authentication, keep Email/Password enabled and configure the project password policy to match the Worker: 15–128 Unicode code points and no more than 512 UTF-8 bytes. Do not enable email-link or social providers for this login flow unless a separate reviewed flow is added.
2. Enable Firebase email-enumeration protection. The Worker still normalizes bad credentials and unknown accounts to the same `INVALID_CREDENTIALS` response.
3. Restrict the Firebase Web API key to the Identity Toolkit API and configure authorized domains to include `tomonode.site`. The key is passed only from the Worker binding; do not add it to the desktop client or commit it to source control.
4. Before release, configure the Firebase Console password-reset email template's custom action handler URL as `https://tomonode.site/password-reset.html`. This is a manual Firebase Console setting; shipping the website file alone does not change Firebase's email links. The website build copies `website/public/password-reset.html` and its local JS/CSS to those exact paths. The handler accepts Firebase's `mode=resetPassword` and `oobCode`, then posts the new password to the Worker. Do not point the reset email at the SPA root or Firebase's default handler.
5. Configure the `FIREBASE_API_KEY` Worker secret from the Firebase Web app configuration. It is intentionally not in `wrangler.toml` or this document:

   ```powershell
   npx wrangler secret put FIREBASE_API_KEY
   ```

Existing `RESEND_API_KEY`, `RESEND_FROM`, `AUTH_CODE_PEPPER`, and `SESSION_PEPPER` bindings remain required. Use independent high-entropy random values for the two pepper secrets; never print them in logs or commits.

## Database migration and rollout

Apply migration `0002_password_auth.sql` to the intended D1 database before deploying the Worker. This is a manual release step and was not run as part of local implementation:

```powershell
npx wrangler d1 migrations apply tomonode-accounts --remote
```

The migration is additive: it retains existing account/session data and adds Firebase account linkage, credential versions, display names, private avatar BLOB columns, login challenges, and purpose-bound enrollment proofs. A password login challenge holds the Firebase UID privately, but does not link it to a legacy account until the email code has been consumed; this keeps a password-only attempt from disabling the legacy email-code route. Linking increments the account credential version, so earlier sessions stop authenticating. A legacy 0.5.7 OTP verification can no longer create a session after that account has a Firebase UID; accounts that have not enrolled retain the old route temporarily so a staged desktop rollout does not lock them out. New clients must use the password-first endpoints only.

Password enrollment keeps the mailbox proof until Firebase creation and D1 linking both succeed. An active request leases that proof for at most two minutes. If Firebase creates the identity but D1 temporarily fails, retry the same enrollment with the same setup token and password before the ten-minute proof expires. When Firebase responds `EMAIL_EXISTS`, the Worker only attempts recovery by signing in with that submitted password while the same unexpired email proof is held. It does not delete Firebase identities. If recovery sign-in fails, use the password-reset flow for an account that already has a password.

Password reset first validates Firebase's one-use action code, revokes TomoNode sessions in D1, and then asks Firebase to commit the new password. This order avoids leaving TomoNode sessions valid if Firebase accepts the reset after D1 becomes unavailable. If the D1 revocation step fails, the password change is not submitted to Firebase.

Do not deploy until the Firebase project settings, Worker secret, Resend sender, D1 migration, custom action handler website asset, and matching desktop client are all ready. This change has not been deployed.

## API contract

All JSON responses are `no-store`. Only the login-code verification endpoint issues a TomoNode session after a Firebase password check and the second, email-delivered code.

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
| `GET /v1/me` | Bearer session | — | `{email,displayName,hasPassword}` |
| `PATCH /v1/me/display-name` | Bearer session | `{displayName}` | Updated profile |
| `GET /v1/me/avatar` | Bearer session | — | Authenticated image bytes (`image/png`, `image/jpeg`, or `image/webp`); `404` when absent |
| `PUT /v1/me/avatar` | Bearer session | `{mimeType,dataBase64}` | `200 {updated:true}` |
| `DELETE /v1/me/avatar` | Bearer session | — | `200 {deleted:true}` |

Wrong, unknown, or unenrolled credentials all return `401 {error:"INVALID_CREDENTIALS"}` and do not send a login code. Enrollment/reset request responses do not identify whether an email has a password. Enrollment proof and login code are separate purpose-bound records, expire after 10 minutes, allow at most five guesses, and are single-use. Password reset is proven by Firebase's one-use email action code, never by a long-lived TomoNode session alone.

## Profile privacy and data limits

- The display/account name is separate from the Minecraft username; duplicate display names are allowed. It is trimmed, 1–32 Unicode code points, and control characters are rejected.
- One custom avatar is stored per account as a D1 BLOB; no public URL or third-party image host is created. The authenticated avatar endpoint is separate from `/v1/me`, returns `private, no-store`, and requires the user's Bearer session on every read.
- Persisted avatar size is at most 128 KiB. Only PNG, JPEG, and WebP raster containers are accepted; SVG/unknown formats, oversized dimensions (over 1024×1024 or one megapixel), animated PNG/WebP, and common EXIF/XMP metadata are rejected. The desktop client should accept at most a 5 MiB source file, resize/re-encode with canvas to a square image, strip EXIF by re-encoding, and send the resulting MIME and prefixless Base64. The Worker independently checks Base64, container signature, image chunk/frame structure, dimensions, and persisted byte limit.
- Upload, read, and delete endpoints are private account APIs. Remove an avatar with `DELETE /v1/me/avatar`; no avatar is fetched during frequent profile/session checks.
- Never log passwords, setup tokens, email codes, Firebase action codes, Firebase ID/refresh tokens, or avatar Base64. Firebase provider ID/refresh tokens are intentionally discarded and never returned to the client.
