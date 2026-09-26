# TomoNode account sign-in service

TomoNode 0.5.7 adds email-code sign-in for the installed Windows app. The desktop client stores its opaque 30-day session in Windows Credential Manager.

This release supports sign-in only. Checkout, billing management, Stripe webhooks, and paid memberships are not exposed by the Worker source or the desktop UI.

## Worker configuration

The Cloudflare Worker uses the existing D1 database binding and initial migration. Preserve the configured database and applied migration state; do not recreate or reset the database.

Configure these server-side Worker secrets in Cloudflare: AUTH_CODE_PEPPER, SESSION_PEPPER, RESEND_API_KEY, and RESEND_FROM.

Keep secret values in Wrangler's secret store. Never put them in the desktop app, account-api.json, source files, or Vite variables. RESEND_FROM must use a sender address verified by Resend.

account-api.json contains the public HTTPS service base URL. Rust reads that same value and permits requests only to its exact HTTPS host. Change it only when the deployed service host changes.

The Worker applies per-IP and per-email rate limits, stores HMAC digests instead of raw verification codes and session tokens, expires codes after 10 minutes, and limits code verification attempts. A sign-in session expires after 30 days.

## Local checks

From cloudflare/account-api, run npm ci, npm run typecheck, and npm test.

These checks use a fake D1 database and a mocked email provider. They do not contact Cloudflare or send email.
