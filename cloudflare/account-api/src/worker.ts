export interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  AUTH_CODE_PEPPER: string;
  SESSION_PEPPER: string;
}

interface AccountRow {
  id: string;
  email: string;
}

interface SessionRow extends AccountRow {
  token_hash: string;
}

const CODE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function fail(status: number, code: string): Response {
  return json({ error: code }, status);
}

function normalizedEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function boundedBody(request: Request, maxBytes: number): Promise<string | null> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function requestJson(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await boundedBody(request, 8192);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function enforceRateLimit(env: Env, bucket: string, now: number, windowMs: number, limit: number): Promise<boolean> {
  const cutoff = now - windowMs;
  await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, window_started_at, request_count)
     VALUES (?, ?, 1)
     ON CONFLICT(bucket) DO UPDATE SET
       window_started_at = CASE WHEN rate_limits.window_started_at <= ? THEN ? ELSE rate_limits.window_started_at END,
       request_count = CASE WHEN rate_limits.window_started_at <= ? THEN 1 ELSE rate_limits.request_count + 1 END`,
  ).bind(bucket, now, cutoff, now, cutoff).run();
  const row = await env.DB.prepare("SELECT request_count FROM rate_limits WHERE bucket = ?")
    .bind(bucket).first<{ request_count: number }>();
  return (row?.request_count ?? limit + 1) <= limit;
}

async function sendCode(env: Env, email: string, code: string): Promise<boolean> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [email],
      subject: "TomoNode sign-in code / TomoNode ログインコード",
      text: `TomoNodeのログイン確認コードは ${code} です。10分以内に入力してください。\n\nYour TomoNode verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    }),
  });
  return response.ok;
}

async function requestCode(request: Request, env: Env): Promise<Response> {
  const body = await requestJson(request);
  const email = normalizedEmail(body?.email);
  if (!email) return fail(400, "INVALID_EMAIL");

  const now = Date.now();
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const ipBucket = await hmacHex(env.AUTH_CODE_PEPPER, ip);
  const emailBucket = await hmacHex(env.AUTH_CODE_PEPPER, email);
  await env.DB.prepare("DELETE FROM rate_limits WHERE window_started_at < ?").bind(now - 24 * 60 * 60 * 1000).run();
  if (!(await enforceRateLimit(env, `ip:${ipBucket}`, now, 60 * 60 * 1000, 8))) return fail(429, "RATE_LIMITED");
  if (!(await enforceRateLimit(env, `email:${emailBucket}`, now, 60 * 60 * 1000, 3))) return fail(429, "RATE_LIMITED");

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const codeHash = await hmacHex(env.AUTH_CODE_PEPPER, `${email}\0${code}`);
  await env.DB.prepare(
    `INSERT INTO email_codes (email, code_hash, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash,
       expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`,
  ).bind(email, codeHash, now + CODE_TTL_MS, now).run();

  try {
    if (!(await sendCode(env, email, code))) {
      await env.DB.prepare("DELETE FROM email_codes WHERE email = ? AND code_hash = ?").bind(email, codeHash).run();
      return fail(503, "EMAIL_UNAVAILABLE");
    }
  } catch {
    await env.DB.prepare("DELETE FROM email_codes WHERE email = ? AND code_hash = ?").bind(email, codeHash).run();
    return fail(503, "EMAIL_UNAVAILABLE");
  }
  return json({ sent: true, expiresInSeconds: CODE_TTL_MS / 1000 }, 202);
}

async function createSession(env: Env, account: AccountRow, now: number): Promise<{ accessToken: string; expiresAt: number }> {
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now).run();
  const accessToken = randomHex(32);
  const tokenHash = await hmacHex(env.SESSION_PEPPER, accessToken);
  const expiresAt = now + SESSION_TTL_MS;
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, account_id, expires_at, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)",
  ).bind(tokenHash, account.id, expiresAt, now, now).run();
  return { accessToken, expiresAt };
}

async function verifyCode(request: Request, env: Env): Promise<Response> {
  const body = await requestJson(request);
  const email = normalizedEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!email || !/^\d{6}$/.test(code)) return fail(400, "INVALID_CODE");

  const now = Date.now();
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const ipBucket = await hmacHex(env.AUTH_CODE_PEPPER, ip);
  const emailBucket = await hmacHex(env.AUTH_CODE_PEPPER, email);
  if (!(await enforceRateLimit(env, `verify-ip:${ipBucket}`, now, 60 * 60 * 1000, 40))) return fail(429, "RATE_LIMITED");
  if (!(await enforceRateLimit(env, `verify-email:${emailBucket}`, now, 60 * 60 * 1000, 10))) return fail(429, "RATE_LIMITED");

  const attempted = await env.DB.prepare(
    `UPDATE email_codes SET attempts = attempts + 1
     WHERE email = ? AND expires_at > ? AND attempts < ?
     RETURNING code_hash, attempts`,
  ).bind(email, now, MAX_CODE_ATTEMPTS).first<{ code_hash: string; attempts: number }>();
  if (!attempted) {
    await env.DB.prepare("DELETE FROM email_codes WHERE email = ? AND (expires_at <= ? OR attempts >= ?)")
      .bind(email, now, MAX_CODE_ATTEMPTS).run();
    return fail(400, "INVALID_OR_EXPIRED_CODE");
  }

  const submittedHash = await hmacHex(env.AUTH_CODE_PEPPER, `${email}\0${code}`);
  if (!constantTimeEqual(submittedHash, attempted.code_hash)) {
    if (attempted.attempts >= MAX_CODE_ATTEMPTS) {
      await env.DB.prepare("DELETE FROM email_codes WHERE email = ? AND attempts >= ?").bind(email, MAX_CODE_ATTEMPTS).run();
    }
    return fail(400, "INVALID_OR_EXPIRED_CODE");
  }

  const consumed = await env.DB.prepare(
    "DELETE FROM email_codes WHERE email = ? AND code_hash = ? AND attempts = ? RETURNING email",
  ).bind(email, attempted.code_hash, attempted.attempts).first<{ email: string }>();
  if (!consumed) return fail(400, "INVALID_OR_EXPIRED_CODE");

  await env.DB.prepare("INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING")
    .bind(crypto.randomUUID(), email, now).run();
  const account = await env.DB.prepare("SELECT id, email FROM accounts WHERE email = ?")
    .bind(email).first<AccountRow>();
  if (!account) return fail(500, "ACCOUNT_UNAVAILABLE");

  const session = await createSession(env, account, now);
  return json({ ...session, account: { email: account.email } });
}

async function authenticate(request: Request, env: Env): Promise<SessionRow | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await hmacHex(env.SESSION_PEPPER, token);
  const now = Date.now();
  const session = await env.DB.prepare(
    `SELECT s.token_hash, a.id, a.email
     FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(tokenHash, now).first<SessionRow>();
  if (session) await env.DB.prepare("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?").bind(now, tokenHash).run();
  return session;
}

async function currentAccount(request: Request, env: Env): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return fail(401, "SESSION_EXPIRED");
  return json({ email: session.email });
}

async function signout(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (/^[a-f0-9]{64}$/.test(token)) {
    const tokenHash = await hmacHex(env.SESSION_PEPPER, token);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  return json({ signedOut: true });
}

export async function fetchHandler(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true });
    if (request.method === "POST" && url.pathname === "/v1/auth/request-code") return requestCode(request, env);
    if (request.method === "POST" && url.pathname === "/v1/auth/verify-code") return verifyCode(request, env);
    if (request.method === "POST" && url.pathname === "/v1/auth/logout") return signout(request, env);
    if (request.method === "GET" && url.pathname === "/v1/me") return currentAccount(request, env);
    return fail(404, "NOT_FOUND");
  } catch {
    return fail(500, "SERVICE_UNAVAILABLE");
  }
}

export default { fetch: fetchHandler };
