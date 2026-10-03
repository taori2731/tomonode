import { describe, expect, it, vi } from "vitest";
import { fetchHandler, type Env } from "./worker";

const unusedEnv = {} as Env;

type FakeAccount = {
  id: string;
  email: string;
  firebase_uid: string | null;
  credential_version: number;
  display_name?: string;
  created_at?: number;
  avatarData?: Uint8Array | null;
  avatarMime?: string | null;
  avatarUpdatedAt?: number | null;
};

type FakeSession = {
  accountId: string;
  expiresAt: number;
  createdAt: number;
  lastUsedAt: number;
  credentialVersion: number;
};

type FakeBrowserAuthRequest = {
  requestId: string;
  userCode: string;
  userCodeHash: string;
  codeChallengeHash: string;
  mode: "login" | "register";
  locale: "ja" | "en";
  status: "pending" | "approved";
  accountId: string | null;
  credentialVersion: number | null;
  expiresAt: number;
  createdAt: number;
  approvedAt: number | null;
  lastPolledAt: number | null;
};

type FakeLoginChallenge = {
  accountId: string;
  firebaseUid: string;
  codeHash: string;
  credentialVersion: number;
  expiresAt: number;
  attempts: number;
  email: string;
};

class FakeAccountDatabase {
  readonly rateLimits = new Map<string, { windowStartedAt: number; requestCount: number }>();
  readonly emailCodes = new Map<string, { codeHash: string; expiresAt: number; attempts: number }>();
  readonly accounts = new Map<string, FakeAccount>();
  readonly sessions = new Map<string, FakeSession>();
  readonly browserAuthRequests = new Map<string, FakeBrowserAuthRequest>();
  readonly loginChallenges = new Map<string, FakeLoginChallenge>();
  readonly enrollmentCodes = new Map<string, { codeHash: string; expiresAt: number; attempts: number }>();
  readonly setupProofs = new Map<string, { email: string; expiresAt: number; processingUntil: number | null }>();
  failNextFirebaseAccountLink = false;
  failNextCredentialVersionUpdate = false;

  prepare(sql: string) {
    let values: unknown[] = [];
    const statement = {
      bind: (...bound: unknown[]) => {
        values = bound;
        return statement;
      },
      first: async <T>() => this.first<T>(sql, values),
      run: async () => this.run(sql, values),
      get sql() { return sql; },
      get values() { return values; },
    };
    return statement;
  }

  async batch(statements: Array<{ run: () => Promise<{ success: boolean; meta?: Record<string, unknown> }> }>) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }

  private async first<T>(sql: string, values: unknown[]): Promise<T | null> {
    if (sql.includes("INSERT INTO rate_limits")) {
      const bucket = String(values[0]);
      const now = Number(values[1]);
      const cutoff = Number(values[2]);
      const previous = this.rateLimits.get(bucket);
      const next = previous && previous.windowStartedAt > cutoff
        ? { windowStartedAt: previous.windowStartedAt, requestCount: previous.requestCount + 1 }
        : { windowStartedAt: now, requestCount: 1 };
      this.rateLimits.set(bucket, next);
      return { request_count: next.requestCount } as T;
    }
    if (sql.includes("SELECT user_code, expires_at, status FROM browser_auth_requests")) {
      const row = this.browserAuthRequests.get(String(values[0]));
      if (!row || row.expiresAt <= Number(values[1])) return null;
      return { user_code: row.userCode, expires_at: row.expiresAt, status: row.status } as T;
    }
    if (sql.includes("SELECT request_id, code_challenge_hash, status, account_id, credential_version, expires_at")) {
      const row = this.browserAuthRequests.get(String(values[0]));
      if (!row || row.expiresAt <= Number(values[1])) return null;
      return {
        request_id: row.requestId,
        code_challenge_hash: row.codeChallengeHash,
        status: row.status,
        account_id: row.accountId,
        credential_version: row.credentialVersion,
        expires_at: row.expiresAt,
      } as T;
    }
    if (sql.includes("UPDATE browser_auth_requests SET last_polled_at = ?")) {
      const row = this.browserAuthRequests.get(String(values[1]));
      if (!row || row.expiresAt <= Number(values[2])
        || (row.lastPolledAt !== null && row.lastPolledAt > Number(values[3]))) return null;
      row.lastPolledAt = Number(values[0]);
      return { request_id: row.requestId } as T;
    }
    if (sql.includes("DELETE FROM browser_auth_requests") && sql.includes("code_challenge_hash = ?") && sql.includes("RETURNING request_id")) {
      const row = this.browserAuthRequests.get(String(values[0]));
      if (!row || row.codeChallengeHash !== values[1] || row.expiresAt <= Number(values[2])) return null;
      this.browserAuthRequests.delete(row.requestId);
      return { request_id: row.requestId } as T;
    }
    if (sql.includes("UPDATE email_codes SET attempts = attempts + 1")) {
      const email = String(values[0]);
      const row = this.emailCodes.get(email);
      if (!row || row.expiresAt <= Number(values[1]) || row.attempts >= Number(values[2])) return null;
      row.attempts += 1;
      return { code_hash: row.codeHash, attempts: row.attempts } as T;
    }
    if (sql.includes("DELETE FROM email_codes") && sql.includes("RETURNING email")) {
      const email = String(values[0]);
      const row = this.emailCodes.get(email);
      if (!row || row.codeHash !== values[1] || row.attempts !== Number(values[2])) return null;
      this.emailCodes.delete(email);
      return { email } as T;
    }
    if (sql.includes("UPDATE login_challenges SET attempts = attempts + 1")) {
      const row = this.loginChallenges.get(String(values[0]));
      if (!row || row.expiresAt <= Number(values[1]) || row.attempts >= Number(values[2])) return null;
      row.attempts += 1;
      return {
        account_id: row.accountId,
        firebase_uid: row.firebaseUid,
        code_hash: row.codeHash,
        credential_version: row.credentialVersion,
        attempts: row.attempts,
      } as T;
    }
    if (sql.includes("FROM login_challenges lc") && sql.includes("JOIN accounts a ON a.id = lc.account_id")) {
      const row = this.loginChallenges.get(String(values[0]));
      return row ? { email: row.email, display_name: "owner", code_hash: row.codeHash } as T : null;
    }
    if (sql.includes("DELETE FROM login_challenges") && sql.includes("RETURNING account_id")) {
      const tokenHash = String(values[0]);
      const row = this.loginChallenges.get(tokenHash);
      if (!row || row.codeHash !== values[1] || row.attempts !== Number(values[2]) || row.expiresAt <= Number(values[3])) return null;
      this.loginChallenges.delete(tokenHash);
      return { account_id: row.accountId, firebase_uid: row.firebaseUid, credential_version: row.credentialVersion, challenge_email: row.email } as T;
    }
    if (sql.includes("UPDATE password_enrollment_codes SET attempts = attempts + 1")) {
      const email = String(values[0]);
      const row = this.enrollmentCodes.get(email);
      if (!row || row.expiresAt <= Number(values[1]) || row.attempts >= Number(values[2])) return null;
      row.attempts += 1;
      return { code_hash: row.codeHash, attempts: row.attempts } as T;
    }
    if (sql.includes("DELETE FROM password_enrollment_codes") && sql.includes("RETURNING email")) {
      const email = String(values[0]);
      const row = this.enrollmentCodes.get(email);
      if (!row || row.codeHash !== values[1] || row.attempts !== Number(values[2])) return null;
      this.enrollmentCodes.delete(email);
      return { email } as T;
    }
    if (sql.includes("UPDATE password_setup_proofs SET processing_until = ?")) {
      const [processingUntil, tokenHash, email, expiresAfter, availableAfter] = values;
      const row = this.setupProofs.get(String(tokenHash));
      if (!row || row.email !== email || row.expiresAt <= Number(expiresAfter)
        || (row.processingUntil !== null && row.processingUntil > Number(availableAfter))) return null;
      row.processingUntil = Number(processingUntil);
      return { email: row.email } as T;
    }
    if (sql.includes("DELETE FROM password_setup_proofs") && sql.includes("RETURNING email")) {
      const tokenHash = String(values[0]);
      const row = this.setupProofs.get(tokenHash);
      if (!row || row.email !== values[1] || row.processingUntil !== Number(values[2])
        || row.expiresAt <= Number(values[3])) return null;
      this.setupProofs.delete(tokenHash);
      return { email: row.email } as T;
    }
    if (sql.includes("SELECT credential_version FROM accounts WHERE email")) {
      const row = this.accounts.get(String(values[0]));
      return row ? { credential_version: row.credential_version } as T : null;
    }
    if (sql.includes("SELECT id, email, firebase_uid, credential_version") && sql.includes("WHERE email = ?")) {
      return (this.accounts.get(String(values[0])) ?? null) as T | null;
    }
    if (sql.includes("SELECT id, email, firebase_uid, credential_version") && sql.includes("WHERE firebase_uid = ?")) {
      return ([...this.accounts.values()].find((row) => row.firebase_uid === values[0]) ?? null) as T | null;
    }
    if (sql.includes("SELECT id, email, firebase_uid, credential_version") && sql.includes("WHERE id = ? AND credential_version = ?")) {
      const account = [...this.accounts.values()].find((row) => row.id === values[0] && row.credential_version === Number(values[1]));
      return (account ?? null) as T | null;
    }
    if (sql.includes("SELECT id, email, firebase_uid, credential_version") && sql.includes("WHERE id = ?")) {
      const account = [...this.accounts.values()].find((row) => row.id === values[0]);
      return (account ?? null) as T | null;
    }
    if (sql.includes("SELECT avatar_data, avatar_mime, avatar_updated_at FROM accounts")) {
      const account = [...this.accounts.values()].find((row) => row.id === values[0]);
      return account ? {
        avatar_data: account.avatarData ?? null,
        avatar_mime: account.avatarMime ?? null,
        avatar_updated_at: account.avatarUpdatedAt ?? null,
      } as T : null;
    }
    if (sql.includes("SELECT id, email FROM accounts WHERE email")) {
      const account = this.accounts.get(String(values[0]));
      return account ? { id: account.id, email: account.email } as T : null;
    }
    if (sql.includes("SELECT id FROM accounts WHERE email")) {
      const account = this.accounts.get(String(values[0]));
      return account ? { id: account.id } as T : null;
    }
    if (sql.includes("FROM sessions s JOIN accounts a")) {
      const tokenHash = String(values[0]);
      const session = this.sessions.get(tokenHash);
      if (!session || session.expiresAt <= Number(values[1])) return null;
      const account = [...this.accounts.values()].find((entry) => entry.id === session.accountId);
      return account ? {
        token_hash: tokenHash,
        created_at: account.created_at,
        session_created_at: session.createdAt,
        session_credential_version: session.credentialVersion,
        id: account.id,
        email: account.email,
        firebase_uid: account.firebase_uid,
        credential_version: account.credential_version,
        display_name: account.display_name ?? "",
      } as T : null;
    }
    return null;
  }

  private async run(sql: string, values: unknown[]) {
    let changes = 1;
    if (sql.includes("INSERT INTO email_codes")) {
      this.emailCodes.set(String(values[0]), { codeHash: String(values[1]), expiresAt: Number(values[2]), attempts: 0 });
    } else if (sql.includes("INSERT INTO login_challenges")) {
      const [tokenHash, firebaseUid, codeHash, credentialVersion, expiresAt, createdAt, email, accountId, expectedEmail, expectedVersion, expectedUid] = values;
      const account = [...this.accounts.values()].find((row) => row.id === accountId);
      if (!account || account.email !== expectedEmail || account.credential_version !== expectedVersion
        || (account.firebase_uid !== null && account.firebase_uid !== expectedUid)) return { success: true, meta: { changes: 0 } };
      this.loginChallenges.set(String(tokenHash), {
        accountId: String(accountId),
        firebaseUid: String(firebaseUid),
        codeHash: String(codeHash),
        credentialVersion: Number(credentialVersion),
        expiresAt: Number(expiresAt),
        attempts: 0,
        email: String(email),
      });
      void createdAt;
    } else if (sql.includes("INSERT INTO password_enrollment_codes")) {
      this.enrollmentCodes.set(String(values[0]), { codeHash: String(values[1]), expiresAt: Number(values[2]), attempts: 0 });
    } else if (sql.includes("INSERT INTO password_setup_proofs")) {
      this.setupProofs.set(String(values[0]), { email: String(values[1]), expiresAt: Number(values[2]), processingUntil: null });
    } else if (sql.includes("INSERT INTO browser_auth_requests")) {
      const [requestId, userCode, userCodeHash, codeChallengeHash, mode, locale, expiresAt, createdAt] = values;
      this.browserAuthRequests.set(String(requestId), {
        requestId: String(requestId),
        userCode: String(userCode),
        userCodeHash: String(userCodeHash),
        codeChallengeHash: String(codeChallengeHash),
        mode: mode as "login" | "register",
        locale: locale as "ja" | "en",
        status: "pending",
        accountId: null,
        credentialVersion: null,
        expiresAt: Number(expiresAt),
        createdAt: Number(createdAt),
        approvedAt: null,
        lastPolledAt: null,
      });
    } else if (sql.includes("INSERT INTO accounts")) {
      const id = String(values[0]);
      const email = String(values[1]);
      const isFirebaseInsert = sql.includes("firebase_uid");
      if (!this.accounts.has(email)) {
        this.accounts.set(email, {
          id,
          email,
          firebase_uid: isFirebaseInsert ? String(values[2]) : null,
          credential_version: isFirebaseInsert ? 1 : 0,
          display_name: isFirebaseInsert ? String(values[3]) : String(values[2]),
          created_at: Number(values[isFirebaseInsert ? 4 : 3]),
        });
      }
    } else if (sql.includes("UPDATE OR IGNORE accounts SET firebase_uid")) {
      if (this.failNextFirebaseAccountLink) {
        this.failNextFirebaseAccountLink = false;
        throw new Error("Injected D1 account link failure");
      }
      const row = [...this.accounts.values()].find((account) => account.id === values[1]);
      if (row && row.firebase_uid === null
        && (values.length < 3 || row.credential_version === Number(values[2]))) {
        row.firebase_uid = String(values[0]);
        row.credential_version += 1;
      }
    } else if (sql.includes("UPDATE accounts SET credential_version = credential_version + 1")) {
      if (this.failNextCredentialVersionUpdate) {
        this.failNextCredentialVersionUpdate = false;
        throw new Error("Injected D1 credential-version failure");
      }
      const row = [...this.accounts.values()].find((account) => account.id === values[0]);
      if (row) row.credential_version += 1;
    } else if (sql.includes("UPDATE accounts SET display_name = ?")) {
      const row = [...this.accounts.values()].find((account) => account.id === values[1]);
      if (row) row.display_name = String(values[0]);
    } else if (sql.includes("UPDATE accounts SET avatar_data = NULL")) {
      const row = [...this.accounts.values()].find((account) => account.id === values[0]);
      if (row) {
        row.avatarData = null;
        row.avatarMime = null;
        row.avatarUpdatedAt = null;
      }
    } else if (sql.includes("UPDATE accounts SET avatar_data = ?")) {
      const row = [...this.accounts.values()].find((account) => account.id === values[3]);
      if (row) {
        row.avatarData = new Uint8Array(values[0] as Uint8Array);
        row.avatarMime = String(values[1]);
        row.avatarUpdatedAt = Number(values[2]);
      }
    } else if (sql.includes("UPDATE browser_auth_requests SET status = 'approved'")) {
      const [accountId, credentialVersion, approvedAt, requestId, userCodeHash, requestNow,
        tokenHash, sessionNow, sessionMinCreatedAt, sessionMaxCreatedAt, expectedAccountId, expectedVersion] = values;
      const request = this.browserAuthRequests.get(String(requestId));
      const session = this.sessions.get(String(tokenHash));
      const account = [...this.accounts.values()].find((entry) => entry.id === session?.accountId);
      const valid = request?.status === "pending" && request.userCodeHash === userCodeHash
        && request.expiresAt > Number(requestNow) && account !== undefined && account.id === expectedAccountId
        && account.id === accountId && account.credential_version === Number(expectedVersion)
        && account.credential_version === session?.credentialVersion && account.firebase_uid !== null
        && session.expiresAt > Number(sessionNow)
        && session.createdAt >= Number(sessionMinCreatedAt) && session.createdAt <= Number(sessionMaxCreatedAt);
      if (request && valid) {
        request.status = "approved";
        request.accountId = String(accountId);
        request.credentialVersion = Number(credentialVersion);
        request.approvedAt = Number(approvedAt);
      } else {
        changes = 0;
      }
    } else if (sql.includes("DELETE FROM sessions WHERE token_hash = ? AND EXISTS")) {
      const [tokenHash, requestId, accountId, credentialVersion, approvedAt] = values;
      const request = this.browserAuthRequests.get(String(requestId));
      if (request?.status === "approved" && request.accountId === accountId
        && request.credentialVersion === Number(credentialVersion) && request.approvedAt === Number(approvedAt)) {
        this.sessions.delete(String(tokenHash));
      } else {
        changes = 0;
      }
    } else if (sql.includes("INSERT INTO sessions") && sql.includes("SELECT ?, a.id")) {
      const [tokenHash, expiresAt, createdAt, lastUsedAt, requestId, requestNow, credentialVersion] = values;
      const request = this.browserAuthRequests.get(String(requestId));
      const account = [...this.accounts.values()].find((entry) => entry.id === request?.accountId);
      if (request?.status === "approved" && request.expiresAt > Number(requestNow)
        && account && request.credentialVersion === account.credential_version
        && account.credential_version === Number(credentialVersion) && account.firebase_uid !== null) {
        this.sessions.set(String(tokenHash), {
          accountId: account.id,
          expiresAt: Number(expiresAt),
          createdAt: Number(createdAt),
          lastUsedAt: Number(lastUsedAt),
          credentialVersion: account.credential_version,
        });
      } else {
        changes = 0;
      }
    } else if (sql.includes("DELETE FROM browser_auth_requests WHERE request_id = ? AND status = 'approved'")) {
      const [requestId, now, credentialVersion, requiredVersion] = values;
      const request = this.browserAuthRequests.get(String(requestId));
      const account = [...this.accounts.values()].find((entry) => entry.id === request?.accountId);
      if (request?.status === "approved" && request.expiresAt > Number(now)
        && request.credentialVersion === Number(credentialVersion)
        && account?.credential_version === Number(requiredVersion) && account.firebase_uid !== null) {
        this.browserAuthRequests.delete(String(requestId));
      } else {
        changes = 0;
      }
    } else if (sql.includes("DELETE FROM browser_auth_requests WHERE request_id = ?")) {
      changes = this.browserAuthRequests.delete(String(values[0])) ? 1 : 0;
    } else if (sql.includes("INSERT INTO sessions")) {
      this.sessions.set(String(values[0]), {
        accountId: String(values[1]),
        expiresAt: Number(values[2]),
        createdAt: Number(values[3]),
        lastUsedAt: Number(values[4]),
        credentialVersion: Number(values[5]),
      });
    } else if (sql.includes("DELETE FROM browser_auth_requests WHERE expires_at")) {
      for (const [requestId, row] of this.browserAuthRequests) {
        if (row.expiresAt <= Number(values[0])) this.browserAuthRequests.delete(requestId);
      }
    } else if (sql.includes("DELETE FROM sessions WHERE expires_at")) {
      for (const [token, session] of this.sessions) if (session.expiresAt <= Number(values[0])) this.sessions.delete(token);
    } else if (sql.includes("UPDATE sessions SET last_used_at")) {
      const session = this.sessions.get(String(values[1]));
      if (session) session.lastUsedAt = Number(values[0]);
    } else if (sql.includes("DELETE FROM sessions WHERE token_hash")) {
      this.sessions.delete(String(values[0]));
    } else if (sql.includes("DELETE FROM sessions WHERE account_id")) {
      for (const [token, session] of this.sessions) if (session.accountId === values[0]) this.sessions.delete(token);
    } else if (sql.includes("DELETE FROM login_challenges WHERE account_id")) {
      for (const [token, challenge] of this.loginChallenges) if (challenge.accountId === values[0]) this.loginChallenges.delete(token);
    } else if (sql.includes("UPDATE password_setup_proofs SET processing_until = NULL")) {
      const row = this.setupProofs.get(String(values[0]));
      if (row && row.email === values[1] && row.processingUntil === Number(values[2])) row.processingUntil = null;
    } else if (sql.includes("DELETE FROM login_challenges WHERE token_hash = ?")) {
      this.loginChallenges.delete(String(values[0]));
    } else if (sql.includes("DELETE FROM email_codes WHERE email = ? AND code_hash = ?")) {
      const email = String(values[0]);
      if (this.emailCodes.get(email)?.codeHash === values[1]) this.emailCodes.delete(email);
    } else if (sql.includes("DELETE FROM email_codes WHERE email = ? AND (expires_at")) {
      const email = String(values[0]);
      const row = this.emailCodes.get(email);
      if (row && (row.expiresAt <= Number(values[1]) || row.attempts >= Number(values[2]))) this.emailCodes.delete(email);
    } else if (sql.includes("DELETE FROM email_codes WHERE email = ? AND attempts")) {
      const email = String(values[0]);
      if ((this.emailCodes.get(email)?.attempts ?? 0) >= Number(values[1])) this.emailCodes.delete(email);
    } else if (sql.includes("DELETE FROM password_enrollment_codes WHERE email = ? AND code_hash")) {
      const email = String(values[0]);
      if (this.enrollmentCodes.get(email)?.codeHash === values[1]) this.enrollmentCodes.delete(email);
    } else if (sql.includes("DELETE FROM password_enrollment_codes WHERE email = ? AND (expires_at")) {
      const email = String(values[0]);
      const row = this.enrollmentCodes.get(email);
      if (row && (row.expiresAt <= Number(values[1]) || row.attempts >= Number(values[2]))) this.enrollmentCodes.delete(email);
    } else if (sql.includes("DELETE FROM password_enrollment_codes WHERE email = ? AND attempts")) {
      const email = String(values[0]);
      if ((this.enrollmentCodes.get(email)?.attempts ?? 0) >= Number(values[1])) this.enrollmentCodes.delete(email);
    } else if (sql.includes("DELETE FROM password_enrollment_codes WHERE expires_at")) {
      for (const [email, row] of this.enrollmentCodes) if (row.expiresAt <= Number(values[0])) this.enrollmentCodes.delete(email);
    } else if (sql.includes("DELETE FROM password_setup_proofs WHERE expires_at")) {
      for (const [token, proof] of this.setupProofs) if (proof.expiresAt <= Number(values[0])) this.setupProofs.delete(token);
    } else if (sql.includes("DELETE FROM rate_limits WHERE window_started_at")) {
      for (const [bucket, row] of this.rateLimits) if (row.windowStartedAt < Number(values[0])) this.rateLimits.delete(bucket);
    }
    return { success: true, meta: { changes } };
  }
}

function makeEnv(database = new FakeAccountDatabase()) {
  const env = {
    DB: database as unknown as Env["DB"],
    RESEND_API_KEY: "test-resend-key",
    RESEND_FROM: "TomoNode <accounts@example.com>",
    AUTH_CODE_PEPPER: "test-code-pepper-not-for-production",
    SESSION_PEPPER: "test-session-pepper-not-for-production",
    FIREBASE_API_KEY: "test-firebase-web-api-key",
    APP_BASE_URL: "https://tomonode.site",
  } satisfies Env;
  return { env, database };
}

function post(path: string, body: unknown, ip = "192.0.2.9", origin?: string): Request {
  const headers = new Headers({ "content-type": "application/json", "cf-connecting-ip": ip });
  if (origin) headers.set("origin", origin);
  return new Request(`https://account-api.tomonode.site${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function authenticated(path: string, method: string, token: string, body?: unknown, origin?: string): Request {
  const headers = new Headers({ authorization: `Bearer ${token}` });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (origin) headers.set("origin", origin);
  return new Request(`https://account-api.tomonode.site${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function sha256HexForTest(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function firebaseResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

async function seedSignedInAccount(database: FakeAccountDatabase, env: Env, email = "owner@example.com", displayName = "owner") {
  const account = {
    id: "signed-in-account",
    email,
    firebase_uid: "firebase-signed-in",
    credential_version: 0,
    display_name: displayName,
  } satisfies FakeAccount;
  database.accounts.set(email, account);
  const accessToken = "a".repeat(64);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_PEPPER),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(accessToken));
  const tokenHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  database.sessions.set(tokenHash, {
    accountId: account.id,
    expiresAt: Date.now() + 60_000,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    credentialVersion: 0,
  });
  return accessToken;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

describe("TomoNode account API routes", () => {
  it("returns a non-cacheable health response", async () => {
    const response = await fetchHandler(new Request("https://account-api.tomonode.site/health"), unusedEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects unsupported routes and protects new billing endpoints", async () => {
    expect((await fetchHandler(new Request("https://account-api.tomonode.site/v1/nope"), unusedEnv)).status).toBe(404);
    expect((await fetchHandler(new Request("https://account-api.tomonode.site/v1/auth/request-code"), unusedEnv)).status).toBe(404);
    for (const path of ["/v1/billing/checkout", "/v1/billing/portal"]) {
      expect((await fetchHandler(new Request(`https://account-api.tomonode.site${path}`, { method: "POST" }), unusedEnv)).status).toBe(401);
    }
    expect((await fetchHandler(new Request("https://account-api.tomonode.site/v1/webhooks/stripe", {method: "POST"}), unusedEnv)).status).toBe(503);
  });

  it("keeps the 0.5.7 email-code route working during staged migration", async () => {
    const { env, database } = makeEnv();
    const originalFetch = globalThis.fetch;
    let deliveredEmail = "";
    let deliveredText = "";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.resend.com/emails");
      const message = JSON.parse(String(init?.body)) as { to: string[]; text: string };
      deliveredEmail = message.to[0] ?? "";
      deliveredText = message.text;
      return Response.json({ id: "email_test" }, { status: 200 });
    }) as typeof fetch;

    try {
      const requested = await fetchHandler(post("/v1/auth/request-code", { email: " Owner@Example.com " }), env);
      expect(requested.status).toBe(202);
      expect(deliveredEmail).toBe("owner@example.com");
      const code = deliveredText.match(/\d{6}/)?.[0];
      expect(code).toBeTruthy();
      const storedCode = database.emailCodes.get("owner@example.com");
      expect(storedCode?.codeHash).not.toBe(code);
      expect(storedCode?.codeHash).toMatch(/^[a-f0-9]{64}$/);

      const verified = await fetchHandler(post("/v1/auth/verify-code", { email: "owner@example.com", code }), env);
      expect(verified.status, JSON.stringify(await verified.clone().json())).toBe(200);
      const session = await verified.json() as { accessToken: string; account: { email: string; hasPassword: boolean } };
      expect(session.accessToken).toMatch(/^[a-f0-9]{64}$/);
      expect(session.account).toMatchObject({ email: "owner@example.com", displayName: "owner", hasPassword: false });

      const authenticated = await fetchHandler(new Request("https://account-api.tomonode.site/v1/me", {
        headers: { authorization: `Bearer ${session.accessToken}` },
      }), env);
      expect(authenticated.status).toBe(200);
      await expect(authenticated.json()).resolves.toMatchObject({ email: "owner@example.com", displayName: "owner", hasPassword: false });

      const logout = await fetchHandler(new Request("https://account-api.tomonode.site/v1/auth/logout", {
        method: "POST",
        headers: { authorization: `Bearer ${session.accessToken}` },
      }), env);
      expect(logout.status).toBe(200);
      expect((await fetchHandler(new Request("https://account-api.tomonode.site/v1/me", {
        headers: { authorization: `Bearer ${session.accessToken}` },
      }), env)).status).toBe(401);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not issue a code for wrong or missing Firebase credentials and uses one generic response", async () => {
    const { env, database } = makeEnv();
    database.accounts.set("legacy@example.com", {
      id: "legacy-account",
      email: "legacy@example.com",
      firebase_uid: null,
      credential_version: 0,
    });
    const originalFetch = globalThis.fetch;
    let firebaseCalls = 0;
    let resendCount = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("https://identitytoolkit.googleapis.com/")) {
        firebaseCalls += 1;
        return firebaseResponse({ error: { message: "INVALID_LOGIN_CREDENTIALS" } }, 400);
      }
      resendCount += 1;
      return Response.json({ id: "unexpected" });
    }) as typeof fetch;

    try {
      const wrongPassword = await fetchHandler(post("/v1/auth/password/login", {
        email: "legacy@example.com", password: "a sufficiently long wrong password",
      }), env);
      const noPasswordAccount = await fetchHandler(post("/v1/auth/password/login", {
        email: "new@example.com", password: "a sufficiently long wrong password",
      }, "192.0.2.10"), env);
      const tooShortPassword = await fetchHandler(post("/v1/auth/password/login", {
        email: "short@example.com", password: "abcde",
      }, "192.0.2.11"), env);
      expect(wrongPassword.status).toBe(401);
      expect(noPasswordAccount.status).toBe(401);
      expect(tooShortPassword.status).toBe(401);
      await expect(wrongPassword.json()).resolves.toEqual({ error: "INVALID_CREDENTIALS" });
      await expect(noPasswordAccount.json()).resolves.toEqual({ error: "INVALID_CREDENTIALS" });
      await expect(tooShortPassword.json()).resolves.toEqual({ error: "INVALID_CREDENTIALS" });
      expect(resendCount).toBe(0);
      expect(firebaseCalls).toBe(2);
      expect(database.loginChallenges.size).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("requires password first, then a challenge-bound email code before issuing a session", async () => {
    const { env, database } = makeEnv();
    const legacySessionToken = await seedSignedInAccount(database, env, "owner@example.com");
    database.accounts.get("owner@example.com")!.firebase_uid = null;
    const originalFetch = globalThis.fetch;
    let deliveredCode = "";
    const deliveredCodes: string[] = [];
    let firebaseCalls = 0;
    let resendCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const target = String(input);
      if (target.startsWith("https://identitytoolkit.googleapis.com/")) {
        firebaseCalls += 1;
        expect(target).toContain("accounts:signInWithPassword");
        const payload = JSON.parse(String(init?.body)) as { email: string; password: string };
        expect(payload).toEqual({ email: "owner@example.com", password: "a correct test passphrase", returnSecureToken: true });
        return firebaseResponse({
          localId: "firebase-user-1",
          email: "owner@example.com",
          idToken: "provider-id-token-must-not-leak",
          refreshToken: "provider-refresh-token-must-not-leak",
          expiresIn: "3600",
        });
      }
      resendCalls += 1;
      const message = JSON.parse(String(init?.body)) as { to: string[]; text: string };
      expect(message.to).toEqual(["owner@example.com"]);
      deliveredCode = message.text.match(/\d{6}/)?.[0] ?? "";
      deliveredCodes.push(deliveredCode);
      return Response.json({ id: "email_login" }, { status: 200 });
    }) as typeof fetch;

    try {
      const start = await fetchHandler(post("/v1/auth/password/login", {
        email: " Owner@Example.com ", password: "a correct test passphrase",
      }), env);
      expect(start.status, JSON.stringify(await start.clone().json())).toBe(202);
      const challenge = await start.json() as { challengeId: string; expiresInSeconds: number };
      expect(challenge.challengeId).toMatch(/^[a-f0-9]{64}$/);
      expect(challenge.expiresInSeconds).toBe(600);
      expect(JSON.stringify(challenge)).not.toContain("provider-id-token");
      expect(JSON.stringify(challenge)).not.toContain("provider-refresh-token");
      expect(firebaseCalls).toBe(2);
      expect(resendCalls).toBe(1);
      expect(database.loginChallenges.size).toBe(1);
      expect(database.accounts.get("owner@example.com")?.firebase_uid).toBeNull();
      expect(database.accounts.get("owner@example.com")?.credential_version).toBe(0);
      expect(database.sessions.size).toBe(1);

      const verified = await fetchHandler(post("/v1/auth/password/verify-login-code", {
        challengeId: challenge.challengeId, code: deliveredCode,
      }), env);
      expect(verified.status, JSON.stringify(await verified.clone().json())).toBe(200);
      const session = await verified.json() as { accessToken: string; account: { email: string; hasPassword: boolean } };
      expect(session.accessToken).toMatch(/^[a-f0-9]{64}$/);
      expect(session.account).toMatchObject({ email: "owner@example.com", displayName: "owner", hasPassword: true });
      expect(JSON.stringify(session)).not.toContain("provider-id-token");
      expect(JSON.stringify(session)).not.toContain("provider-refresh-token");
      expect(database.loginChallenges.size).toBe(0);
      expect(database.sessions.size).toBe(1);
      expect(database.accounts.get("owner@example.com")?.firebase_uid).toBe("firebase-user-1");
      expect(database.accounts.get("owner@example.com")?.credential_version).toBe(1);
      expect((await fetchHandler(authenticated("/v1/me", "GET", legacySessionToken), env)).status).toBe(401);

      // Old 0.5.7 OTP endpoints remain during rollout, but must not bypass
      // password + second factor after Firebase enrollment.
      const legacyRequest = await fetchHandler(post("/v1/auth/request-code", { email: "owner@example.com" }), env);
      expect(legacyRequest.status).toBe(202);
      const legacyText = await legacyRequest.json() as { sent: boolean };
      expect(legacyText.sent).toBe(true);
      const oldOtp = deliveredCodes.at(-1) ?? "";
      expect(oldOtp).toMatch(/^\d{6}$/);
      expect((await fetchHandler(post("/v1/auth/verify-code", { email: "owner@example.com", code: oldOtp }), env)).status).toBe(400);
      expect(database.sessions.size).toBe(1);

      const replayed = await fetchHandler(post("/v1/auth/password/verify-login-code", {
        challengeId: challenge.challengeId, code: deliveredCode,
      }), env);
      expect(replayed.status).toBe(400);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rate-limits password attempts by email before calling Firebase", async () => {
    const { env } = makeEnv();
    const originalFetch = globalThis.fetch;
    let firebaseCalls = 0;
    globalThis.fetch = vi.fn(async () => {
      firebaseCalls += 1;
      return firebaseResponse({ error: { message: "INVALID_LOGIN_CREDENTIALS" } }, 400);
    }) as typeof fetch;

    try {
      const responses: Response[] = [];
      for (let index = 0; index < 9; index += 1) {
        responses.push(await fetchHandler(post("/v1/auth/password/login", {
          email: "throttled@example.com", password: "a sufficiently long attempted password",
        }, `192.0.2.${index + 1}`), env));
      }
      expect(responses.slice(0, 8).every((response) => response.status === 401)).toBe(true);
      expect(responses[8]?.status).toBe(429);
      expect(firebaseCalls).toBe(8);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses a purpose-bound, single-use email proof for enrollment and signs in without a second OTP", async () => {
    const { env, database } = makeEnv();
    const originalFetch = globalThis.fetch;
    const minimumPassword = "🔒".repeat(6);
    const maximumPassword = "🔒".repeat(128);
    let deliveredCode = "";
    let signupCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const target = String(input);
      if (target.startsWith("https://identitytoolkit.googleapis.com/")) {
        signupCalls += 1;
        expect(target).toContain("accounts:signUp");
        const payload = JSON.parse(String(init?.body)) as { email: string; password: string; returnSecureToken: boolean };
        expect(payload.returnSecureToken).toBe(true);
        expect(payload.password).toBe(payload.email === "first@example.com" ? minimumPassword : maximumPassword);
        return firebaseResponse({
          localId: `firebase-${payload.email}`,
          email: payload.email,
          idToken: "provider-id-token-must-not-leak",
          refreshToken: "provider-refresh-token-must-not-leak",
        });
      }
      const message = JSON.parse(String(init?.body)) as { text: string };
      deliveredCode = message.text.match(/\d{6}/)?.[0] ?? "";
      return Response.json({ id: "email_enrollment" }, { status: 200 });
    }) as typeof fetch;

    try {
      const requested = await fetchHandler(post("/v1/auth/password/request-enrollment-code", {
        email: "first@example.com",
      }), env);
      expect(requested.status).toBe(202);
      const verified = await fetchHandler(post("/v1/auth/password/verify-enrollment-code", {
        email: "first@example.com", code: deliveredCode,
      }), env);
      expect(verified.status).toBe(200);
      const { setupToken } = await verified.json() as { setupToken: string };
      expect(setupToken).toMatch(/^[a-f0-9]{64}$/);
      expect(database.sessions.size).toBe(0);

      const tooShort = await fetchHandler(post("/v1/auth/password/enroll", {
        email: "first@example.com", setupToken, password: "🔒".repeat(5),
      }), env);
      expect(tooShort.status).toBe(400);
      const tooLong = await fetchHandler(post("/v1/auth/password/enroll", {
        email: "first@example.com", setupToken, password: "🔒".repeat(129),
      }), env);
      expect(tooLong.status).toBe(400);
      expect(signupCalls).toBe(0);

      const enrolled = await fetchHandler(post("/v1/auth/password/enroll", {
        email: "first@example.com", setupToken, password: minimumPassword,
      }), env);
      expect(enrolled.status).toBe(200);
      const enrollmentResponse = await enrolled.json();
      expect(enrollmentResponse).toMatchObject({ passwordSet: true, enrolled: true, accessToken: expect.stringMatching(/^[a-f0-9]{64}$/), account: { email: "first@example.com", hasPassword: true, userId: expect.any(String), createdAt: expect.any(Number) } });
      expect(database.accounts.get("first@example.com")?.firebase_uid).toBe("firebase-first@example.com");
      expect(database.sessions.size).toBe(1);
      expect(JSON.stringify(enrollmentResponse)).not.toContain("provider-id-token");

      const replay = await fetchHandler(post("/v1/auth/password/enroll", {
        email: "first@example.com", setupToken, password: "another initial secure passphrase",
      }), env);
      expect(replay.status).toBe(400);
      expect(signupCalls).toBe(1);

      const maxRequested = await fetchHandler(post("/v1/auth/password/request-enrollment-code", {
        email: "maximum@example.com",
      }), env);
      expect(maxRequested.status).toBe(202);
      const maxProof = await fetchHandler(post("/v1/auth/password/verify-enrollment-code", {
        email: "maximum@example.com", code: deliveredCode,
      }), env);
      expect(maxProof.status).toBe(200);
      const { setupToken: maximumSetupToken } = await maxProof.json() as { setupToken: string };
      const maxEnrolled = await fetchHandler(post("/v1/auth/password/enroll", {
        email: "maximum@example.com", setupToken: maximumSetupToken, password: maximumPassword,
      }), env);
      expect(maxEnrolled.status).toBe(200);
      expect(database.accounts.get("maximum@example.com")?.firebase_uid).toBe("firebase-maximum@example.com");
      expect(signupCalls).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("recovers a Firebase signup after D1 link failure without consuming the mailbox proof", async () => {
    const { env, database } = makeEnv();
    const legacySessionToken = await seedSignedInAccount(database, env, "legacy@example.com");
    database.accounts.get("legacy@example.com")!.firebase_uid = null;
    database.failNextFirebaseAccountLink = true;
    const originalFetch = globalThis.fetch;
    let deliveredCode = "";
    let signupCalls = 0;
    let recoverySigninCalls = 0;
    let firebaseUserCreated = false;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const target = String(input);
      if (target.startsWith("https://identitytoolkit.googleapis.com/")) {
        const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        if (target.includes("accounts:signUp")) {
          signupCalls += 1;
          if (firebaseUserCreated) return firebaseResponse({ error: { message: "EMAIL_EXISTS" } }, 400);
          firebaseUserCreated = true;
          return firebaseResponse({ localId: "firebase-legacy-user", email: "legacy@example.com" });
        }
        if (target.includes("accounts:signInWithPassword")) {
          recoverySigninCalls += 1;
          expect(payload).toEqual({ email: "legacy@example.com", password: "legacy secure passphrase", returnSecureToken: true });
          return firebaseResponse({
            localId: "firebase-legacy-user",
            email: "legacy@example.com",
            idToken: "recovery-id-token-must-not-leak",
            refreshToken: "recovery-refresh-token-must-not-leak",
          });
        }
        throw new Error(`Unexpected Firebase request: ${target}`);
      }
      const message = JSON.parse(String(init?.body)) as { text: string };
      deliveredCode = message.text.match(/\d{6}/)?.[0] ?? "";
      return Response.json({ id: "email_enrollment" }, { status: 200 });
    }) as typeof fetch;

    try {
      const requested = await fetchHandler(post("/v1/auth/password/request-enrollment-code", {
        email: "legacy@example.com",
      }), env);
      expect(requested.status).toBe(202);
      const verified = await fetchHandler(post("/v1/auth/password/verify-enrollment-code", {
        email: "legacy@example.com", code: deliveredCode,
      }), env);
      expect(verified.status).toBe(200);
      const { setupToken } = await verified.json() as { setupToken: string };

      const failedLink = await fetchHandler(post("/v1/auth/password/enroll", {
        email: "legacy@example.com", setupToken, password: "legacy secure passphrase",
      }), env);
      expect(failedLink.status).toBe(500);
      expect(database.setupProofs.size).toBe(1);
      expect(database.setupProofs.values().next().value?.processingUntil).toBeNull();
      expect(database.accounts.get("legacy@example.com")?.firebase_uid).toBeNull();
      expect(firebaseUserCreated).toBe(true);

      const recovered = await fetchHandler(post("/v1/auth/password/enroll", {
        email: "legacy@example.com", setupToken, password: "legacy secure passphrase",
      }), env);
      expect(recovered.status).toBe(200);
      const recoveryResponse = await recovered.json();
      expect(recoveryResponse).toMatchObject({ passwordSet: true, enrolled: true, accessToken: expect.stringMatching(/^[a-f0-9]{64}$/) });
      expect(signupCalls).toBe(2);
      expect(recoverySigninCalls).toBe(1);
      expect(database.accounts.get("legacy@example.com")?.firebase_uid).toBe("firebase-legacy-user");
      expect(database.accounts.get("legacy@example.com")?.credential_version).toBe(1);
      expect(database.sessions.size).toBe(1);
      expect(database.setupProofs.size).toBe(0);
      expect(JSON.stringify(recoveryResponse)).not.toContain("recovery-id-token");
      expect((await fetchHandler(authenticated("/v1/me", "GET", legacySessionToken), env)).status).toBe(401);

      const replay = await fetchHandler(post("/v1/auth/password/enroll", {
        email: "legacy@example.com", setupToken, password: "legacy secure passphrase",
      }), env);
      expect(replay.status).toBe(400);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes Firebase password-reset enumeration and revokes TomoNode sessions on completion", async () => {
    const database = new FakeAccountDatabase();
    database.accounts.set("owner@example.com", {
      id: "owner-account",
      email: "owner@example.com",
      firebase_uid: "firebase-owner",
      credential_version: 0,
    });
    database.sessions.set("session-hash", {
      accountId: "owner-account",
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      credentialVersion: 0,
    });
    const { env } = makeEnv(database);
    const originalFetch = globalThis.fetch;
    let resetCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const target = String(input);
      if (target.includes("accounts:sendOobCode")) {
        const payload = JSON.parse(String(init?.body)) as { email: string };
        return payload.email === "missing@example.com"
          ? firebaseResponse({ error: { message: "EMAIL_NOT_FOUND" } }, 400)
          : firebaseResponse({ email: payload.email });
      }
      if (target.includes("accounts:resetPassword")) {
        resetCalls += 1;
        const payload = JSON.parse(String(init?.body)) as { oobCode: string; newPassword?: string };
        expect(payload.oobCode).toBe("firebase-action-code-1234567890");
        if (payload.newPassword === undefined) {
          expect(database.sessions.size).toBe(1);
          expect(database.accounts.get("owner@example.com")?.credential_version).toBe(0);
          return firebaseResponse({ email: "owner@example.com", requestType: "PASSWORD_RESET" });
        }
        expect(payload.newPassword).toBe("a replacement secure passphrase");
        expect(database.sessions.size).toBe(0);
        expect(database.accounts.get("owner@example.com")?.credential_version).toBe(1);
        return firebaseResponse({ email: "owner@example.com", requestType: "PASSWORD_RESET" });
      }
      throw new Error("Unexpected outbound request");
    }) as typeof fetch;

    try {
      const existing = await fetchHandler(post("/v1/auth/password/request-reset", { email: "owner@example.com" }), env);
      const missing = await fetchHandler(post("/v1/auth/password/request-reset", { email: "missing@example.com" }, "192.0.2.10"), env);
      expect(existing.status).toBe(202);
      expect(missing.status).toBe(202);
      await expect(existing.json()).resolves.toEqual({ requested: true });
      await expect(missing.json()).resolves.toEqual({ requested: true });

      const invalidPassword = await fetchHandler(post("/v1/auth/password/complete-reset", {
        oobCode: "firebase-action-code-1234567890",
        newPassword: "abcde",
      }), env);
      expect(invalidPassword.status).toBe(400);
      expect(resetCalls).toBe(0);

      const completed = await fetchHandler(post("/v1/auth/password/complete-reset", {
        oobCode: "firebase-action-code-1234567890",
        newPassword: "a replacement secure passphrase",
      }), env);
      expect(completed.status).toBe(200);
      await expect(completed.json()).resolves.toEqual({ passwordChanged: true });
      expect(database.sessions.size).toBe(0);
      expect(database.accounts.get("owner@example.com")?.credential_version).toBe(1);
      expect(resetCalls).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not commit a Firebase password reset when D1 session revocation fails", async () => {
    const database = new FakeAccountDatabase();
    database.accounts.set("owner@example.com", {
      id: "owner-account",
      email: "owner@example.com",
      firebase_uid: "firebase-owner",
      credential_version: 0,
    });
    database.sessions.set("session-hash", {
      accountId: "owner-account",
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      credentialVersion: 0,
    });
    database.failNextCredentialVersionUpdate = true;
    const { env } = makeEnv(database);
    const originalFetch = globalThis.fetch;
    let resetCommitCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("accounts:resetPassword");
      const payload = JSON.parse(String(init?.body)) as { oobCode: string; newPassword?: string };
      if (payload.newPassword !== undefined) resetCommitCalls += 1;
      return firebaseResponse({ email: "owner@example.com", requestType: "PASSWORD_RESET" });
    }) as typeof fetch;

    try {
      const response = await fetchHandler(post("/v1/auth/password/complete-reset", {
        oobCode: "firebase-action-code-1234567890",
        newPassword: "a replacement secure passphrase",
      }), env);
      expect(response.status).toBe(500);
      expect(resetCommitCalls).toBe(0);
      expect(database.accounts.get("owner@example.com")?.credential_version).toBe(0);
      expect(database.sessions.size).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("allows account-page CORS only from the configured TomoNode origin and scoped routes", async () => {
    const { env } = makeEnv();
    for (const [path, method] of [
      ["/v1/auth/password/login", "POST"],
      ["/v1/auth/password/complete-reset", "POST"],
      ["/v1/auth/logout", "POST"],
      ["/v1/auth/browser/request", "GET"],
      ["/v1/auth/browser/approve", "POST"],
    ]) {
      const allowed = await fetchHandler(new Request(`https://account-api.tomonode.site${path}`, {
        method: "OPTIONS",
        headers: {
          origin: "https://tomonode.site",
          "access-control-request-method": method,
          "access-control-request-headers": "authorization,content-type",
        },
      }), env);
      expect(allowed.status).toBe(204);
      expect(allowed.headers.get("access-control-allow-origin")).toBe("https://tomonode.site");
      expect(allowed.headers.get("access-control-allow-methods")).toContain(method);
    }

    const rejected = await fetchHandler(new Request("https://account-api.tomonode.site/v1/auth/browser/approve", {
      method: "OPTIONS",
      headers: { origin: "https://attacker.example" },
    }), env);
    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();

    const nativeRoute = await fetchHandler(new Request("https://account-api.tomonode.site/v1/auth/browser/start", {
      method: "OPTIONS",
      headers: { origin: "https://tomonode.site" },
    }), env);
    expect(nativeRoute.headers.get("access-control-allow-origin")).toBeNull();

    const unrelated = await fetchHandler(new Request("https://account-api.tomonode.site/health", {
      headers: { origin: "https://tomonode.site" },
    }), env);
    expect(unrelated.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("completes browser authorization with a recent approval, matching proof, and one-time polling", async () => {
    const { env, database } = makeEnv();
    const approvalToken = await seedSignedInAccount(database, env);
    const verifier = "b".repeat(64);
    const codeChallenge = await sha256HexForTest(verifier);
    const started = await fetchHandler(post("/v1/auth/browser/start", {
      codeChallenge,
      mode: "login",
      locale: "ja",
    }), env);
    expect(started.status).toBe(200);
    const startData = await started.json() as {
      requestId: string;
      userCode: string;
      browserUrl: string;
      expiresInSeconds: number;
      intervalSeconds: number;
    };
    expect(startData.requestId).toMatch(/^[a-f0-9]{32}$/);
    expect(startData.userCode).toMatch(/^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/);
    expect(startData.expiresInSeconds).toBe(600);
    expect(startData.intervalSeconds).toBe(3);
    const browserUrl = new URL(startData.browserUrl);
    expect(browserUrl.origin).toBe("https://tomonode.site");
    expect(browserUrl.pathname).toBe("/account.html");
    expect(browserUrl.searchParams.get("request")).toBe(startData.requestId);
    expect(browserUrl.searchParams.get("mode")).toBe("login");
    expect(browserUrl.searchParams.get("lang")).toBe("ja");

    const stored = database.browserAuthRequests.get(startData.requestId)!;
    expect(stored.userCode).toBe(startData.userCode);
    expect(stored.userCodeHash).not.toBe(startData.userCode);
    expect(JSON.stringify(stored)).not.toContain(verifier);

    const requestInfo = await fetchHandler(new Request(`https://account-api.tomonode.site/v1/auth/browser/request?requestId=${startData.requestId}`, {
      headers: { origin: "https://tomonode.site" },
    }), env);
    expect(requestInfo.status).toBe(200);
    expect(requestInfo.headers.get("access-control-allow-origin")).toBe("https://tomonode.site");
    await expect(requestInfo.json()).resolves.toEqual({
      userCode: startData.userCode,
      expiresInSeconds: 600,
      status: "pending",
    });

    const pending = await fetchHandler(post("/v1/auth/browser/poll", {
      requestId: startData.requestId, codeVerifier: verifier,
    }), env);
    expect(pending.status).toBe(202);
    await expect(pending.json()).resolves.toEqual({ status: "pending" });
    const tooFrequent = await fetchHandler(post("/v1/auth/browser/poll", {
      requestId: startData.requestId, codeVerifier: verifier,
    }), env);
    expect(tooFrequent.status).toBe(429);
    const wrongProof = await fetchHandler(post("/v1/auth/browser/poll", {
      requestId: startData.requestId, codeVerifier: "c".repeat(64),
    }), env);
    expect(wrongProof.status).toBe(401);

    const approval = await fetchHandler(authenticated("/v1/auth/browser/approve", "POST", approvalToken, {
      requestId: startData.requestId,
      userCode: startData.userCode.toLowerCase(),
    }, "https://tomonode.site"), env);
    expect(approval.status).toBe(200);
    expect(approval.headers.get("access-control-allow-origin")).toBe("https://tomonode.site");
    await expect(approval.json()).resolves.toEqual({ approved: true });
    expect(database.sessions.size).toBe(0);

    const approvedInfo = await fetchHandler(new Request(`https://account-api.tomonode.site/v1/auth/browser/request?requestId=${startData.requestId}`, {
      headers: { origin: "https://tomonode.site" },
    }), env);
    const approvedBody = await approvedInfo.json() as { userCode: string; expiresInSeconds: number; status: string; email?: string };
    expect(approvedBody.userCode).toBe(startData.userCode);
    expect(approvedBody.expiresInSeconds).toBeGreaterThan(0);
    expect(approvedBody.status).toBe("approved");
    expect(approvedBody.email).toBeUndefined();

    stored.lastPolledAt = Date.now() - 3001;
    const completed = await fetchHandler(post("/v1/auth/browser/poll", {
      requestId: startData.requestId, codeVerifier: verifier,
    }), env);
    expect(completed.status).toBe(200);
    const completion = await completed.json() as {
      status: string;
      accessToken: string;
      expiresAt: number;
      account: { email: string; displayName: string; hasPassword: boolean };
    };
    expect(completion).toMatchObject({
      status: "complete",
      accessToken: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresAt: expect.any(Number),
      account: { email: "owner@example.com", displayName: "owner", hasPassword: true },
    });
    expect(JSON.stringify(completion)).not.toContain(verifier);
    expect(database.browserAuthRequests.has(startData.requestId)).toBe(false);
    expect(database.sessions.size).toBe(1);

    const replay = await fetchHandler(post("/v1/auth/browser/poll", {
      requestId: startData.requestId, codeVerifier: verifier,
    }), env);
    expect(replay.status).toBe(410);

    const cancelVerifier = "d".repeat(64);
    const cancelledRequest = await fetchHandler(post("/v1/auth/browser/start", {
      codeChallenge: await sha256HexForTest(cancelVerifier), mode: "register", locale: "en",
    }), env);
    const cancelData = await cancelledRequest.json() as { requestId: string };
    const cancelled = await fetchHandler(post("/v1/auth/browser/cancel", {
      requestId: cancelData.requestId, codeVerifier: cancelVerifier,
    }), env);
    expect(cancelled.status).toBe(200);
    await expect(cancelled.json()).resolves.toEqual({ cancelled: true });
    expect(database.browserAuthRequests.has(cancelData.requestId)).toBe(false);
  });

  it("rejects old approval sessions and expires browser authorization requests", async () => {
    const { env, database } = makeEnv();
    const approvalToken = await seedSignedInAccount(database, env);
    const verifier = "e".repeat(64);
    const started = await fetchHandler(post("/v1/auth/browser/start", {
      codeChallenge: await sha256HexForTest(verifier), mode: "login", locale: "en",
    }), env);
    const startData = await started.json() as { requestId: string; userCode: string };
    const session = [...database.sessions.values()][0]!;
    session.createdAt = Date.now() - 600_001;
    const staleApproval = await fetchHandler(authenticated("/v1/auth/browser/approve", "POST", approvalToken, {
      requestId: startData.requestId, userCode: startData.userCode,
    }), env);
    expect(staleApproval.status).toBe(401);
    expect(database.sessions.size).toBe(1);
    expect(database.browserAuthRequests.get(startData.requestId)?.status).toBe("pending");

    session.createdAt = Date.now();
    const requestRow = database.browserAuthRequests.get(startData.requestId)!;
    requestRow.expiresAt = Date.now() - 1;
    const expiredInfo = await fetchHandler(new Request(`https://account-api.tomonode.site/v1/auth/browser/request?requestId=${startData.requestId}`), env);
    expect(expiredInfo.status).toBe(410);
    const expiredPoll = await fetchHandler(post("/v1/auth/browser/poll", {
      requestId: startData.requestId, codeVerifier: verifier,
    }), env);
    expect(expiredPoll.status).toBe(410);
    const expiredApproval = await fetchHandler(authenticated("/v1/auth/browser/approve", "POST", approvalToken, {
      requestId: startData.requestId, userCode: startData.userCode,
    }), env);
    expect(expiredApproval.status).toBe(409);
    expect(database.sessions.size).toBe(1);
  });

  it("does not allow a legacy email-code session to approve browser authorization", async () => {
    const { env, database } = makeEnv();
    const legacyToken = await seedSignedInAccount(database, env);
    database.accounts.get("owner@example.com")!.firebase_uid = null;
    const verifier = "9".repeat(64);
    const started = await fetchHandler(post("/v1/auth/browser/start", {
      codeChallenge: await sha256HexForTest(verifier), mode: "login", locale: "en",
    }), env);
    const startData = await started.json() as { requestId: string; userCode: string };

    const approval = await fetchHandler(authenticated("/v1/auth/browser/approve", "POST", legacyToken, {
      requestId: startData.requestId, userCode: startData.userCode,
    }), env);
    expect(approval.status).toBe(401);
    await expect(approval.json()).resolves.toEqual({ error: "RECENT_PASSWORD_LOGIN_REQUIRED" });
    expect(database.sessions.size).toBe(1);
    expect(database.browserAuthRequests.get(startData.requestId)?.status).toBe("pending");
  });

  it("does not issue a browser session after approval credentials change", async () => {
    const { env, database } = makeEnv();
    const approvalToken = await seedSignedInAccount(database, env);
    const verifier = "f".repeat(64);
    const started = await fetchHandler(post("/v1/auth/browser/start", {
      codeChallenge: await sha256HexForTest(verifier), mode: "login", locale: "ja",
    }), env);
    const startData = await started.json() as { requestId: string; userCode: string };
    const approval = await fetchHandler(authenticated("/v1/auth/browser/approve", "POST", approvalToken, {
      requestId: startData.requestId, userCode: startData.userCode,
    }), env);
    expect(approval.status).toBe(200);
    database.accounts.get("owner@example.com")!.credential_version += 1;
    const requestRow = database.browserAuthRequests.get(startData.requestId)!;
    requestRow.lastPolledAt = Date.now() - 3001;

    const staleGrant = await fetchHandler(post("/v1/auth/browser/poll", {
      requestId: startData.requestId, codeVerifier: verifier,
    }), env);
    expect(staleGrant.status).toBe(401);
    await expect(staleGrant.json()).resolves.toEqual({ error: "CREDENTIALS_CHANGED" });
    expect(database.sessions.size).toBe(0);
    expect(database.browserAuthRequests.has(startData.requestId)).toBe(false);
  });

  it("updates only the authenticated TomoNode display name with safe normalization", async () => {
    const { env, database } = makeEnv();
    const accessToken = await seedSignedInAccount(database, env);
    const updated = await fetchHandler(authenticated("/v1/me/display-name", "PATCH", accessToken, {
      displayName: "  Rafa 🌙  ",
    }), env);
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      email: "owner@example.com",
      displayName: "Rafa 🌙",
      hasPassword: true,
    });
    expect(database.accounts.get("owner@example.com")?.display_name).toBe("Rafa 🌙");

    const invalid = await fetchHandler(authenticated("/v1/me/display-name", "PATCH", accessToken, {
      displayName: "line 1\nline 2",
    }), env);
    expect(invalid.status).toBe(400);
    expect(database.accounts.get("owner@example.com")?.display_name).toBe("Rafa 🌙");
    expect((await fetchHandler(new Request("https://account-api.tomonode.site/v1/me", { method: "PATCH" }), env)).status).toBe(404);
  });

  it("stores and serves only bounded, authenticated raster avatars", async () => {
    const { env, database } = makeEnv();
    const accessToken = await seedSignedInAccount(database, env);
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/4MsAAAAASUVORK5CYII=";
    const pngBytes = Uint8Array.from(atob(pngBase64), (character) => character.charCodeAt(0));

    const unauthenticated = await fetchHandler(new Request("https://account-api.tomonode.site/v1/me/avatar"), env);
    expect(unauthenticated.status).toBe(401);

    const uploaded = await fetchHandler(authenticated("/v1/me/avatar", "PUT", accessToken, {
      mimeType: "image/png",
      dataBase64: pngBase64,
    }), env);
    expect(uploaded.status).toBe(200);
    await expect(uploaded.json()).resolves.toEqual({ updated: true });

    const served = await fetchHandler(authenticated("/v1/me/avatar", "GET", accessToken), env);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("cache-control")).toContain("no-store");
    expect([...new Uint8Array(await served.arrayBuffer())]).toEqual([...pngBytes]);

    const mimeMismatch = await fetchHandler(authenticated("/v1/me/avatar", "PUT", accessToken, {
      mimeType: "image/jpeg",
      dataBase64: pngBase64,
    }), env);
    expect(mimeMismatch.status).toBe(400);

    const svg = btoa('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const rejectedSvg = await fetchHandler(authenticated("/v1/me/avatar", "PUT", accessToken, {
      mimeType: "image/svg+xml",
      dataBase64: svg,
    }), env);
    expect(rejectedSvg.status).toBe(400);

    const tooLarge = await fetchHandler(authenticated("/v1/me/avatar", "PUT", accessToken, {
      mimeType: "image/png",
      dataBase64: "A".repeat(175_000),
    }), env);
    expect(tooLarge.status).toBe(400);

    const removed = await fetchHandler(authenticated("/v1/me/avatar", "DELETE", accessToken), env);
    expect(removed.status).toBe(200);
    await expect(removed.json()).resolves.toEqual({ deleted: true });
    expect((await fetchHandler(authenticated("/v1/me/avatar", "GET", accessToken), env)).status).toBe(404);
    expect(database.accounts.get("owner@example.com")?.avatarData).toBeNull();
  });

  it("sends fresh password-change proof only to the signed-in Firebase account", async () => {
    const { env, database } = makeEnv();
    const accessToken = await seedSignedInAccount(database, env);
    const originalFetch = globalThis.fetch;
    let firebaseCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      firebaseCalls += 1;
      expect(String(input)).toContain("accounts:sendOobCode");
      expect(JSON.parse(String(init?.body))).toEqual({ requestType: "PASSWORD_RESET", email: "owner@example.com" });
      return firebaseResponse({ email: "owner@example.com" });
    }) as typeof fetch;
    try {
      const requested = await fetchHandler(authenticated("/v1/me/password-reset", "POST", accessToken, {}), env);
      expect(requested.status).toBe(202);
      await expect(requested.json()).resolves.toEqual({ requested: true });
      expect(firebaseCalls).toBe(1);

      const staleLegacyDb = new FakeAccountDatabase();
      const { env: legacyEnv } = makeEnv(staleLegacyDb);
      const legacyToken = await seedSignedInAccount(staleLegacyDb, legacyEnv, "legacy@example.com");
      staleLegacyDb.accounts.get("legacy@example.com")!.firebase_uid = null;
      const notConfigured = await fetchHandler(authenticated("/v1/me/password-reset", "POST", legacyToken, {}), legacyEnv);
      expect(notConfigured.status).toBe(409);
      expect(firebaseCalls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
