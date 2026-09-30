import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fetchHandler } from "../src/worker.ts";

class SqliteD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    for (const migration of [
      "../migrations/0001_initial.sql",
      "../migrations/0002_password_auth.sql",
      "../migrations/0003_browser_auth.sql",
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
