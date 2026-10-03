import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fetchHandler } from "../src/worker.ts";
import { WEB_SESSION_COOKIE, sessionCookie, webSessionToken } from "../src/web-session.ts";

function webRequest(path, { cookie, origin = "https://tomonode.site", marker = "1", token, body = {}, method = "POST" } = {}) {
  const headers = { origin, "content-type": "application/json" };
  if (marker) headers["x-tomonode-web-client"] = marker;
  if (cookie) headers.cookie = cookie;
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`https://account-api.tomonode.site${path}`, { method, headers, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
}
const cookieFor = token => `${WEB_SESSION_COOKIE}=${token}`;

test("remembered browser sessions restore the real account, preserve expiration and leave native Bearer auth unchanged", async () => {
  const { DB, env, token } = await emailFixture();
  try {
    const cookie = cookieFor(token);
    const status = await fetchHandler(webRequest("/v1/auth/web-session", { cookie, body: { statusOnly: true } }), env);
    assert.equal(status.status, 200);
    const statusData = await status.json();
    assert.equal(statusData.account.userId, "stable-id");
    assert.equal(statusData.accessToken, undefined, "public header must never receive a Bearer");
    assert.equal(status.headers.get("set-cookie"), null, "reading must not extend the session");
    assert.equal(status.headers.get("access-control-allow-credentials"), "true");
    assert.equal(status.headers.get("cache-control"), "no-store, max-age=0");
    const resumed = await fetchHandler(webRequest("/v1/auth/web-session", { cookie }), env);
    assert.deepEqual(await resumed.json(), { accessToken: token, account: statusData.account });
    assert.equal(await sessionStatus(env, token), 200);
    const cookieOnlyNative = await fetchHandler(new Request("https://account-api.tomonode.site/v1/me", { headers: { cookie } }), env);
    assert.equal(cookieOnlyNative.status, 401, "cookie auth is confined to its dedicated endpoint");
    assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM sessions").get().n, 1);
  } finally { DB.close(); }
});

for (const options of [{ origin: "https://evil.test" }, { origin: "null" }, { origin: "https://tomonode.site.evil.test" }, { origin: "http://tomonode.site" }, { marker: "" }, { marker: "2" }]) {
  test(`remembered session rejects untrusted browser context ${JSON.stringify(options)}`, async () => {
    const { DB, env, token } = await emailFixture();
    try {
      const result = await fetchHandler(webRequest("/v1/auth/web-session", { cookie: cookieFor(token), ...options }), env);
      assert.equal(result.status, 403);
      assert.deepEqual(await result.json(), { error: "WEB_ORIGIN_REQUIRED" });
      assert.equal(result.headers.get("set-cookie"), null);
      assert.equal(await sessionStatus(env, token), 200, "a hostile origin cannot erase another site's session");
    } finally { DB.close(); }
  });
}

for (const cause of ["expiry", "password-version", "removed", "duplicate", "malformed", "bearer-and-cookie"]) {
  test(`remembered session fails closed and clears invalid cookie: ${cause}`, async () => {
    const { DB, env, token } = await emailFixture();
    try {
      if (cause === "expiry") DB.sqlite.prepare("UPDATE sessions SET expires_at=0").run();
      if (cause === "password-version") DB.sqlite.prepare("UPDATE accounts SET credential_version=credential_version+1").run();
      if (cause === "removed") DB.sqlite.prepare("DELETE FROM sessions").run();
      let cookie = cookieFor(token);
      if (cause === "missing") cookie = "";
      if (cause === "duplicate") cookie += `; ${cookie}`;
      if (cause === "malformed") cookie = cookieFor("invalid");
      const result = await fetchHandler(webRequest("/v1/auth/web-session", { cookie, ...(cause === "bearer-and-cookie" ? { token } : {}) }), env);
      assert.equal(result.status, 401);
      assert.deepEqual(await result.json(), { error: "SESSION_EXPIRED" });
      assert.ok(result.headers.get("set-cookie").includes("Max-Age=0"));
    } finally { DB.close(); }
  });
}

test("anonymous site navigation is a normal no-session response, not a console error or a new cookie", async () => {
  const { DB, env } = await emailFixture();
  try {
    for (const body of [{}, { statusOnly: true }]) {
      const result = await fetchHandler(webRequest("/v1/auth/web-session", { body }), env);
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), { account: null });
      assert.equal(result.headers.get("set-cookie"), null);
    }
  } finally { DB.close(); }
});

test("cookie is host-only, HttpOnly, Secure, partitioned and bounded to the original 30-day expiry", () => {
  const now = Date.now();
  const value = sessionCookie("a".repeat(64), now + 90 * 86400000, now);
  for (const piece of ["__Host-", "Path=/", "Max-Age=2592000", "Secure", "HttpOnly", "SameSite=None", "Partitioned"]) assert.ok(value.includes(piece));
  assert.equal(value.includes("Domain="), false);
  assert.ok(sessionCookie("a".repeat(64), now - 1000, now).includes("Max-Age=0"));
  assert.equal(webSessionToken(webRequest("/", { cookie: `other=x; ${cookieFor("a".repeat(64))}` })), "a".repeat(64));
});

test("web logout revokes remembered session, clears cookie and does not revoke another device", async () => {
  const { DB, env, token } = await emailFixture();
  const other = "f".repeat(64);
  try {
    const now = Date.now();
    DB.sqlite.prepare("INSERT INTO sessions (token_hash,account_id,expires_at,created_at,last_used_at,credential_version) VALUES (?,'stable-id',?,?,?,0)").run(await hmacHex(env.SESSION_PEPPER, other), now + 600000, now, now);
    const result = await fetchHandler(webRequest("/v1/auth/logout", { cookie: cookieFor(token), token }), env);
    assert.equal(result.status, 200);
    assert.ok(result.headers.get("set-cookie").includes("Max-Age=0"));
    assert.equal(await sessionStatus(env, token), 401);
    assert.equal(await sessionStatus(env, other), 200);
  } finally { DB.close(); }
});

for (const context of ["web", "native", "hostile"]) {
  test(`only a trusted website's successful password+email-code login gets a remembered cookie: ${context}`, async t => {
    const { DB, env } = await emailFixture();
    const provider = emailProvider(t);
    try {
      const challenge = await fetchHandler(post("/v1/auth/password/login", { email: "old@example.test", password: "six123" }), env);
      assert.equal(challenge.status, 202);
      const { challengeId } = await challenge.json();
      const request = webRequest("/v1/auth/password/verify-login-code", {
        body: { challengeId, code: provider.otp },
        ...(context === "native" ? { marker: "" } : context === "hostile" ? { origin: "https://evil.test" } : {}),
      });
      const verified = await fetchHandler(request, env);
      assert.equal(verified.status, 200);
      const data = await verified.json();
      const cookie = verified.headers.get("set-cookie");
      if (context !== "web") assert.equal(cookie, null);
      else {
        assert.ok(cookie.includes(`=${data.accessToken};`));
        assert.ok(cookie.includes("HttpOnly"));
        const resumed = await fetchHandler(webRequest("/v1/auth/web-session", { cookie: cookie.split(";")[0] }), env);
        assert.equal(resumed.status, 200);
        assert.equal((await resumed.json()).account.userId, "stable-id");
      }
    } finally { DB.close(); }
  });
}

class SqliteD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    for (const migration of [
      "../migrations/0001_initial.sql",
      "../migrations/0002_password_auth.sql",
      "../migrations/0003_browser_auth.sql",
      "../migrations/0004_email_change_and_identity.sql",
    ]) {
      this.sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
    }
  }

  prepare(sql) {
    let values = [];
    const statement = {
      bind: (...bound) => {
        values = bound;
        return statement;
      },
      first: async () => this.sqlite.prepare(sql).get(...values) ?? null,
      run: async () => {
        const result = this.sqlite.prepare(sql).run(...values);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
    return statement;
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.sqlite.close();
  }
}

async function emailFixture() {
  const DB = new SqliteD1();
  const env = { DB, RESEND_API_KEY: "test", RESEND_FROM: "accounts@example.test", AUTH_CODE_PEPPER: "test-auth", SESSION_PEPPER: "test-session", FIREBASE_API_KEY: "test", APP_BASE_URL: "https://tomonode.site" };
  const token = "e".repeat(64);
  const createdAt = Date.UTC(2025, 0, 2);
  const now = Date.now();
  DB.sqlite.prepare(`INSERT INTO accounts (id,email,firebase_uid,credential_version,display_name,created_at,stripe_customer_id,avatar_data,avatar_mime,avatar_updated_at)
    VALUES ('stable-id','old@example.test','stable-uid',0,'Original Name',?,'customer-id',?,'image/png',?)`).run(createdAt, new Uint8Array([1,2,3]), now);
  DB.sqlite.prepare("INSERT INTO sessions (token_hash,account_id,expires_at,created_at,last_used_at,credential_version) VALUES (?,'stable-id',?,?,?,0)").run(await hmacHex(env.SESSION_PEPPER, token), now + 600000, now, now);
  DB.sqlite.prepare("INSERT INTO subscriptions (stripe_subscription_id,account_id,status,updated_at) VALUES ('subscription-id','stable-id','active',?)").run(now);
  return { DB, env, token, createdAt };
}

function emailProvider(t, options = {}) {
  const calls = [];
  let applied = false;
  let otp = "";
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const body = JSON.parse(init.body);
    const endpoint = String(url).split("/").at(-1).split("?")[0];
    calls.push(endpoint);
    if (String(url) === "https://api.resend.com/emails") {
      otp = body.text.match(/\d{6}/)[0];
      return Response.json({ id: "test-mail" });
    }
    if (endpoint === "accounts:signInWithPassword") {
      if (options.badPassword) return Response.json({ error: { message: "INVALID_LOGIN_CREDENTIALS" } }, { status: 400 });
      return Response.json({ localId: "stable-uid", email: applied ? "new@example.test" : "old@example.test", idToken: "ephemeral-provider-token-not-returned" });
    }
    if (endpoint === "accounts:sendOobCode") {
      assert.equal(body.requestType, "VERIFY_AND_CHANGE_EMAIL");
      assert.equal(body.newEmail, "new@example.test");
      return Response.json({});
    }
    if (endpoint === "accounts:resetPassword") return Response.json(applied
      ? { error: { message: "INVALID_OOB_CODE" } }
      : { requestType: options.purpose ?? "VERIFY_AND_CHANGE_EMAIL", email: "old@example.test", newEmail: "new@example.test" }, { status: applied ? 400 : 200 });
    if (endpoint === "accounts:update") {
      await options.beforeApply?.();
      if (options.providerUnavailable) return Response.json({}, { status: 503 });
      applied = true;
      options.afterApply?.();
      return Response.json({});
    }
    throw new Error(`Unexpected endpoint ${endpoint}`);
  });
  return { calls, get applied() { return applied; }, get otp() { return otp; } };
}

async function requestNewEmail(env, token) {
  return fetchHandler(post("/v1/account/email-change/request", { newEmail: "new@example.test", currentPassword: "six123" }, "192.0.2.51", token), env);
}
async function applyNewEmail(env) {
  return fetchHandler(post("/v1/auth/email-change/complete", { oobCode: "test-single-use-action-code" }), env);
}
async function sessionStatus(env, token) {
  return (await fetchHandler(new Request("https://account-api.tomonode.site/v1/me", { headers: { authorization: `Bearer ${token}` } }), env)).status;
}

test("a credential change during Firebase password verification cannot create a fresh login challenge", async (t) => {
  const { DB, env } = await emailFixture();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.ok(String(url).includes("accounts:signInWithPassword"));
    calls += 1;
    if (calls === 2) DB.sqlite.prepare("UPDATE accounts SET credential_version=credential_version+1 WHERE id='stable-id'").run();
    return Response.json({ localId: "stable-uid", email: "old@example.test" });
  });
  try {
    const result = await fetchHandler(post("/v1/auth/password/login", { email: "old@example.test", password: "six123" }), env);
    assert.equal(result.status, 401);
    assert.equal(calls, 2);
    assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM login_challenges").get().n, 0);
  } finally { DB.close(); }
});

test("email change verifies password and mailbox, preserves identity/assets/plan, and revokes old sessions", async (t) => {
  const { DB, env, token, createdAt } = await emailFixture();
  const provider = emailProvider(t, { beforeApply: async () => assert.equal(await sessionStatus(env, token), 401) });
  try {
    assert.equal((await requestNewEmail(env, token)).status, 202);
    assert.equal(await sessionStatus(env, token), 200, "request alone must not change account");
    const changed = await applyNewEmail(env);
    assert.equal(changed.status, 200, JSON.stringify(await changed.clone().json()));
    assert.deepEqual(await changed.json(), { emailChanged: true, account: { userId: "stable-id", email: "new@example.test", createdAt, displayName: "Original Name", hasPassword: true } });
    assert.equal(await sessionStatus(env, token), 401);
    assert.equal(DB.sqlite.prepare("SELECT stripe_customer_id FROM accounts WHERE id='stable-id'").get().stripe_customer_id, "customer-id");
    assert.deepEqual([...DB.sqlite.prepare("SELECT avatar_data FROM accounts WHERE id='stable-id'").get().avatar_data], [1,2,3]);
    assert.equal(DB.sqlite.prepare("SELECT account_id FROM subscriptions").get().account_id, "stable-id");
    assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM pending_email_changes").get().n, 0);
    assert.equal((await applyNewEmail(env)).status, 400);
    assert.equal(provider.calls.filter(x => x === "accounts:update").length, 1);
  } finally { DB.close(); }
});

for (const scenario of ["wrong-password", "wrong-purpose", "db-before-provider", "provider-unavailable", "db-after-provider"]) {
  test(`email change fails safely: ${scenario}`, async (t) => {
    const { DB, env, token } = await emailFixture();
    const originalBatch = DB.batch.bind(DB);
    const provider = emailProvider(t, {
      badPassword: scenario === "wrong-password",
      purpose: scenario === "wrong-purpose" ? "PASSWORD_RESET" : undefined,
      providerUnavailable: scenario === "provider-unavailable",
      afterApply: scenario === "db-after-provider" ? () => { DB.batch = async () => { throw new Error("injected database outage"); }; } : undefined,
    });
    try {
      const requested = await requestNewEmail(env, token);
      if (scenario === "wrong-password") {
        assert.equal(requested.status, 401);
        assert.equal(provider.calls.length, 1);
        assert.equal(await sessionStatus(env, token), 200);
        return;
      }
      assert.equal(requested.status, 202);
      if (scenario === "db-before-provider") DB.batch = async () => { throw new Error("injected database outage"); };
      const response = await applyNewEmail(env);
      assert.equal(response.status, scenario === "wrong-purpose" ? 400 : 503);
      assert.equal(provider.applied, scenario === "db-after-provider");
      assert.equal(await sessionStatus(env, token), ["wrong-purpose", "db-before-provider"].includes(scenario) ? 200 : 401);
      DB.batch = originalBatch;
      if (scenario === "provider-unavailable") {
        assert.equal((await applyNewEmail(env)).status, 409, "duplicate callback must respect applying lease");
      }
      if (scenario === "db-after-provider") {
        const login = await fetchHandler(post("/v1/auth/password/login", { email: "new@example.test", password: "six123" }), env);
        assert.equal(login.status, 202, JSON.stringify(await login.clone().json()));
        const { challengeId } = await login.json();
        const verified = await fetchHandler(post("/v1/auth/password/verify-login-code", { challengeId, code: provider.otp }), env);
        assert.equal(verified.status, 200, JSON.stringify(await verified.clone().json()));
        const recovered = await verified.json();
        assert.equal(recovered.account.userId, "stable-id");
        assert.equal(recovered.account.email, "new@example.test");
        assert.equal(await sessionStatus(env, recovered.accessToken), 200);
      }
    } finally { DB.close(); }
  });
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function post(path, body, ip = "192.0.2.50", accessToken) {
  const headers = new Headers({ "content-type": "application/json", "cf-connecting-ip": ip });
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  return new Request(`https://account-api.tomonode.site${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function readJson(response) {
  return await response.json();
}

test("SQLite migrations support atomic browser authorization and credential invalidation", async () => {
  const database = new SqliteD1();
  const env = {
    DB: database,
    RESEND_API_KEY: "unused-test-key",
    RESEND_FROM: "TomoNode <accounts@example.com>",
    AUTH_CODE_PEPPER: "sqlite-test-auth-pepper",
    SESSION_PEPPER: "sqlite-test-session-pepper",
    FIREBASE_API_KEY: "unused-test-firebase-key",
    APP_BASE_URL: "https://tomonode.site",
  };

  try {
    const now = Date.now();
    const accountId = "sqlite-account-1";
    const approvalToken = "a".repeat(64);
    const approvalTokenHash = await hmacHex(env.SESSION_PEPPER, approvalToken);
    database.sqlite.prepare(
      `INSERT INTO accounts (id, email, firebase_uid, credential_version, display_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(accountId, "sqlite@example.test", "firebase-sqlite-user", 0, "sqlite", now);
    database.sqlite.prepare(
      `INSERT INTO sessions (token_hash, account_id, expires_at, created_at, last_used_at, credential_version)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(approvalTokenHash, accountId, now + 60_000, now, now, 0);

    const verifier = "c".repeat(64);
    const startResponse = await fetchHandler(post("/v1/auth/browser/start", {
      codeChallenge: await sha256Hex(verifier), mode: "login", locale: "en",
    }), env);
    assert.equal(startResponse.status, 200);
    const started = await readJson(startResponse);
    assert.match(started.requestId, /^[a-f0-9]{32}$/);
    assert.equal(started.expiresInSeconds, 600);
    assert.equal(started.intervalSeconds, 3);

    const pendingResponse = await fetchHandler(post("/v1/auth/browser/poll", {
      requestId: started.requestId, codeVerifier: verifier,
    }), env);
    assert.equal(pendingResponse.status, 202);
    assert.deepEqual(await readJson(pendingResponse), { status: "pending" });
    const wrongProof = await fetchHandler(post("/v1/auth/browser/poll", {
      requestId: started.requestId, codeVerifier: "d".repeat(64),
    }), env);
    assert.equal(wrongProof.status, 401);

    const approvedResponse = await fetchHandler(post("/v1/auth/browser/approve", {
      requestId: started.requestId, userCode: started.userCode,
    }, "192.0.2.50", approvalToken), env);
    assert.equal(approvedResponse.status, 200);
    assert.deepEqual(await readJson(approvedResponse), { approved: true });
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS count FROM sessions WHERE token_hash = ?").get(approvalTokenHash).count, 0);

    const approvedRequest = database.sqlite.prepare("SELECT last_polled_at FROM browser_auth_requests WHERE request_id = ?")
      .get(started.requestId);
    assert.ok(approvedRequest);
    database.sqlite.prepare("UPDATE browser_auth_requests SET last_polled_at = ? WHERE request_id = ?")
      .run(Date.now() - 3001, started.requestId);
    const completedResponse = await fetchHandler(post("/v1/auth/browser/poll", {
      requestId: started.requestId, codeVerifier: verifier,
    }), env);
    assert.equal(completedResponse.status, 200);
    const completed = await readJson(completedResponse);
    assert.equal(completed.status, "complete");
    assert.match(completed.accessToken, /^[a-f0-9]{64}$/);
    assert.equal(completed.account.email, "sqlite@example.test");
    assert.equal(completed.account.hasPassword, true);
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS count FROM sessions WHERE account_id = ?").get(accountId).count, 1);
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS count FROM browser_auth_requests WHERE request_id = ?").get(started.requestId).count, 0);

    const replay = await fetchHandler(post("/v1/auth/browser/poll", {
      requestId: started.requestId, codeVerifier: verifier,
    }), env);
    assert.equal(replay.status, 410);

    const secondApprovalToken = "e".repeat(64);
    const secondApprovalTokenHash = await hmacHex(env.SESSION_PEPPER, secondApprovalToken);
    const secondStart = await fetchHandler(post("/v1/auth/browser/start", {
      codeChallenge: await sha256Hex("f".repeat(64)), mode: "register", locale: "ja",
    }), env);
    const secondRequest = await readJson(secondStart);
    const approvalNow = Date.now();
    database.sqlite.prepare(
      `INSERT INTO sessions (token_hash, account_id, expires_at, created_at, last_used_at, credential_version)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(secondApprovalTokenHash, accountId, approvalNow + 60_000, approvalNow, approvalNow, 0);
    const secondApproved = await fetchHandler(post("/v1/auth/browser/approve", {
      requestId: secondRequest.requestId, userCode: secondRequest.userCode,
    }, "192.0.2.51", secondApprovalToken), env);
    assert.equal(secondApproved.status, 200);
    database.sqlite.prepare("UPDATE accounts SET credential_version = credential_version + 1 WHERE id = ?").run(accountId);
    const staleGrant = await fetchHandler(post("/v1/auth/browser/poll", {
      requestId: secondRequest.requestId, codeVerifier: "f".repeat(64),
    }), env);
    assert.equal(staleGrant.status, 401);
    assert.deepEqual(await readJson(staleGrant), { error: "CREDENTIALS_CHANGED" });
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS count FROM sessions WHERE token_hash = ?").get(secondApprovalTokenHash).count, 0);
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS count FROM sessions WHERE credential_version = 1").get().count, 0);
  } finally {
    database.close();
  }
});
