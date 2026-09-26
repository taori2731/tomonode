import { describe, expect, it, vi } from "vitest";
import { fetchHandler, type Env } from "./worker";

const unusedEnv = {} as Env;

type FakeAccount = { id: string; email: string };

class FakeAccountDatabase {
  readonly rateLimits = new Map<string, { windowStartedAt: number; requestCount: number }>();
  readonly emailCodes = new Map<string, { codeHash: string; expiresAt: number; attempts: number }>();
  readonly accounts = new Map<string, FakeAccount>();
  readonly sessions = new Map<string, { accountId: string; expiresAt: number; lastUsedAt: number }>();

  prepare(sql: string) {
    let values: unknown[] = [];
    const statement = {
      bind: (...bound: unknown[]) => {
        values = bound;
        return statement;
      },
      first: async <T>() => this.first<T>(sql, values),
      run: async () => this.run(sql, values),
    };
    return statement;
  }

  private async first<T>(sql: string, values: unknown[]): Promise<T | null> {
    if (sql.includes("SELECT request_count FROM rate_limits")) {
      const row = this.rateLimits.get(String(values[0]));
      return (row ? { request_count: row.requestCount } : null) as T | null;
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
      if (!row || row.codeHash !== values[1] || row.attempts !== values[2]) return null;
      this.emailCodes.delete(email);
      return { email } as T;
    }
    if (sql.includes("SELECT id, email FROM accounts WHERE email")) {
      return (this.accounts.get(String(values[0])) ?? null) as T | null;
    }
    if (sql.includes("FROM sessions s JOIN accounts a")) {
      const tokenHash = String(values[0]);
      const session = this.sessions.get(tokenHash);
      if (!session || session.expiresAt <= Number(values[1])) return null;
      const account = [...this.accounts.values()].find((entry) => entry.id === session.accountId);
      return account ? { token_hash: tokenHash, ...account } as T : null;
    }
    return null;
  }

  private async run(sql: string, values: unknown[]) {
    if (sql.includes("INSERT INTO rate_limits")) {
      const bucket = String(values[0]);
      const now = Number(values[1]);
      const cutoff = Number(values[2]);
      const previous = this.rateLimits.get(bucket);
      this.rateLimits.set(bucket, previous && previous.windowStartedAt > cutoff
        ? { windowStartedAt: previous.windowStartedAt, requestCount: previous.requestCount + 1 }
        : { windowStartedAt: now, requestCount: 1 });
    } else if (sql.includes("INSERT INTO email_codes")) {
      this.emailCodes.set(String(values[0]), {
        codeHash: String(values[1]),
        expiresAt: Number(values[2]),
        attempts: 0,
      });
    } else if (sql.includes("INSERT INTO accounts")) {
      const [, email] = values.map(String);
      if (!this.accounts.has(email)) this.accounts.set(email, { id: String(values[0]), email });
    } else if (sql.includes("INSERT INTO sessions")) {
      this.sessions.set(String(values[0]), {
        accountId: String(values[1]),
        expiresAt: Number(values[2]),
        lastUsedAt: Number(values[4]),
      });
    } else if (sql.includes("DELETE FROM sessions WHERE expires_at")) {
      for (const [token, session] of this.sessions) {
        if (session.expiresAt <= Number(values[0])) this.sessions.delete(token);
      }
    } else if (sql.includes("UPDATE sessions SET last_used_at")) {
      const session = this.sessions.get(String(values[1]));
      if (session) session.lastUsedAt = Number(values[0]);
    } else if (sql.includes("DELETE FROM sessions WHERE token_hash")) {
      this.sessions.delete(String(values[0]));
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
    }
    return { success: true, meta: { changes: 0 } };
  }
}

describe("TomoNode account API routes", () => {
  it("returns a non-cacheable health response", async () => {
    const response = await fetchHandler(new Request("https://account-api.tomonode.site/health"), unusedEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects unsupported routes, methods, and all payment endpoints", async () => {
    expect((await fetchHandler(new Request("https://account-api.tomonode.site/v1/nope"), unusedEnv)).status).toBe(404);
    expect((await fetchHandler(new Request("https://account-api.tomonode.site/v1/auth/request-code"), unusedEnv)).status).toBe(404);
    for (const path of ["/v1/billing/checkout", "/v1/billing/portal", "/v1/webhooks/stripe"]) {
      expect((await fetchHandler(new Request(`https://account-api.tomonode.site${path}`, { method: "POST" }), unusedEnv)).status).toBe(404);
    }
  });

  it("requires a valid session before returning account information", async () => {
    const response = await fetchHandler(new Request("https://account-api.tomonode.site/v1/me"), unusedEnv);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "SESSION_EXPIRED" });
  });

  it("stores only a one-time code digest, verifies it, and revokes the issued session", async () => {
    const database = new FakeAccountDatabase();
    const env = {
      DB: database as unknown as Env["DB"],
      RESEND_API_KEY: "test-resend-key",
      RESEND_FROM: "TomoNode <accounts@example.com>",
      AUTH_CODE_PEPPER: "test-code-pepper-not-for-production",
      SESSION_PEPPER: "test-session-pepper-not-for-production",
    } satisfies Env;

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
      const request = await fetchHandler(new Request("https://account-api.tomonode.site/v1/auth/request-code", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.9" },
        body: JSON.stringify({ email: " Owner@Example.com " }),
      }), env);
      expect(request.status).toBe(202);
      expect(deliveredEmail).toBe("owner@example.com");
      const code = deliveredText.match(/\d{6}/)?.[0];
      expect(code).toBeTruthy();
      const storedCode = database.emailCodes.get("owner@example.com");
      expect(storedCode?.codeHash).not.toBe(code);
      expect(storedCode?.codeHash).toMatch(/^[a-f0-9]{64}$/);

      const verified = await fetchHandler(new Request("https://account-api.tomonode.site/v1/auth/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.9" },
        body: JSON.stringify({ email: "owner@example.com", code }),
      }), env);
      expect(verified.status).toBe(200);
      const session = await verified.json() as { accessToken: string; account: { email: string } };
      expect(session.accessToken).toMatch(/^[a-f0-9]{64}$/);
      expect(session.account).toEqual({ email: "owner@example.com" });

      const authenticated = await fetchHandler(new Request("https://account-api.tomonode.site/v1/me", {
        headers: { authorization: `Bearer ${session.accessToken}` },
      }), env);
      expect(authenticated.status).toBe(200);
      await expect(authenticated.json()).resolves.toEqual({ email: "owner@example.com" });

      const signedOut = await fetchHandler(new Request("https://account-api.tomonode.site/v1/auth/logout", {
        method: "POST",
        headers: { authorization: `Bearer ${session.accessToken}` },
      }), env);
      expect(signedOut.status).toBe(200);
      const revoked = await fetchHandler(new Request("https://account-api.tomonode.site/v1/me", {
        headers: { authorization: `Bearer ${session.accessToken}` },
      }), env);
      expect(revoked.status).toBe(401);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
