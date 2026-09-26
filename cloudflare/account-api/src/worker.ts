export interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  AUTH_CODE_PEPPER: string;
  SESSION_PEPPER: string;
  FIREBASE_API_KEY: string;
  APP_BASE_URL: string;
}

interface AccountRow {
  id: string;
  email: string;
  firebase_uid?: string | null;
  credential_version?: number;
  display_name?: string | null;
}

interface SessionRow extends AccountRow {
  token_hash: string;
  session_credential_version: number;
}

interface FirebaseResult {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  errorCode: string;
}

const CODE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const PASSWORD_SETUP_PROOF_TTL_MS = 10 * 60 * 1000;
const PASSWORD_SETUP_LEASE_MS = 2 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const MIN_PASSWORD_CODE_POINTS = 15;
const MAX_PASSWORD_CODE_POINTS = 128;
const MAX_AVATAR_BYTES = 128 * 1024;
const MAX_AVATAR_DIMENSION = 1024;
const MAX_AVATAR_PIXELS = 1024 * 1024;
const MAX_AVATAR_REQUEST_BYTES = 180 * 1024;
const MAX_DISPLAY_NAME_CODE_POINTS = 32;

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

async function requestJsonLimit(request: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  const raw = await boundedBody(request, maxBytes);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function requestJson(request: Request): Promise<Record<string, unknown> | null> {
  return requestJsonLimit(request, 8192);
}

async function enforceRateLimit(env: Env, bucket: string, now: number, windowMs: number, limit: number): Promise<boolean> {
  const cutoff = now - windowMs;
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, window_started_at, request_count)
     VALUES (?, ?, 1)
     ON CONFLICT(bucket) DO UPDATE SET
       window_started_at = CASE WHEN rate_limits.window_started_at <= ? THEN ? ELSE rate_limits.window_started_at END,
       request_count = CASE WHEN rate_limits.window_started_at <= ? THEN 1 ELSE rate_limits.request_count + 1 END
     RETURNING request_count`,
  ).bind(bucket, now, cutoff, now, cutoff).first<{ request_count: number }>();
  return (row?.request_count ?? limit + 1) <= limit;
}

async function sendCode(env: Env, email: string, code: string, purpose: "login" | "enrollment" = "login"): Promise<boolean> {
  const enrollment = purpose === "enrollment";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [email],
      subject: enrollment ? "TomoNode password setup code / TomoNode パスワード設定コード" : "TomoNode sign-in verification / TomoNode ログイン確認",
      text: enrollment
        ? `TomoNodeのパスワード設定確認コードは ${code} です。10分以内に入力してください。\n\nYour TomoNode password setup code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`
        : `TomoNodeのログイン確認コードは ${code} です。10分以内に入力してください。\n\nYour TomoNode sign-in verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    }),
  });
  return response.ok;
}

function firebaseErrorCode(data: Record<string, unknown>): string {
  const error = data.error;
  if (!error || typeof error !== "object") return "";
  const message = (error as Record<string, unknown>).message;
  if (typeof message !== "string") return "";
  return message.split(/[ :]/, 1)[0] ?? "";
}

async function firebaseRequest(env: Env, action: string, body: Record<string, unknown>): Promise<FirebaseResult> {
  const apiKey = env.FIREBASE_API_KEY?.trim();
  if (!apiKey || apiKey.length > 512) return { ok: false, status: 0, data: {}, errorCode: "CONFIGURATION_MISSING" };
  const url = new URL(`https://identitytoolkit.googleapis.com/v1/${action}`);
  url.searchParams.set("key", apiKey);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const value: unknown = await response.json().catch(() => ({}));
    const data = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    return { ok: response.ok, status: response.status, data, errorCode: firebaseErrorCode(data) };
  } catch {
    return { ok: false, status: 0, data: {}, errorCode: "NETWORK_ERROR" };
  }
}

function firebaseUnavailable(result: FirebaseResult): boolean {
  return result.status === 0 || result.status >= 500 || ["API_KEY_INVALID", "PROJECT_NOT_FOUND", "OPERATION_NOT_ALLOWED"].includes(result.errorCode);
}

function acceptablePassword(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const points = Array.from(value).length;
  return points >= MIN_PASSWORD_CODE_POINTS && points <= MAX_PASSWORD_CODE_POINTS
    && new TextEncoder().encode(value).byteLength <= 512;
}

function defaultDisplayName(email: string): string {
  return Array.from(email.split("@", 1)[0] ?? "TomoNode").slice(0, MAX_DISPLAY_NAME_CODE_POINTS).join("") || "TomoNode";
}

function displayNameFor(account: AccountRow): string {
  const saved = typeof account.display_name === "string" ? account.display_name.trim() : "";
  return saved || defaultDisplayName(account.email);
}

function validDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  const codePoints = Array.from(normalized).length;
  if (codePoints < 1 || codePoints > MAX_DISPLAY_NAME_CODE_POINTS) return null;
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(normalized)) return null;
  if (new TextEncoder().encode(normalized).byteLength > 128) return null;
  return normalized;
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) * 0x1000000)
    + (((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0));
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0)
    | ((bytes[offset + 1] ?? 0) << 8)
    | ((bytes[offset + 2] ?? 0) << 16)
    | ((bytes[offset + 3] ?? 0) << 24);
}

function avatarDimensions(mimeType: string, bytes: Uint8Array): { width: number; height: number } | null {
  let width = 0;
  let height = 0;
  if (mimeType === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 45 || !signature.every((value, index) => bytes[index] === value)) return null;
    let offset = 8;
    let hasHeader = false;
    let hasData = false;
    let hasEnd = false;
    while (offset + 12 <= bytes.length) {
      const length = readU32BE(bytes, offset);
      if (length > bytes.length - offset - 12) return null;
      const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (!hasHeader) {
        if (kind !== "IHDR" || length !== 13) return null;
        width = readU32BE(bytes, offset + 8);
        height = readU32BE(bytes, offset + 12);
        hasHeader = true;
      } else if (kind === "IHDR") {
        return null;
      }
      if (kind === "eXIf" || kind === "acTL" || kind === "fcTL" || kind === "fdAT") return null;
      if (kind === "IDAT") hasData = true;
      offset += length + 12;
      if (kind === "IEND") {
        if (length !== 0 || offset !== bytes.length) return null;
        hasEnd = true;
        break;
      }
    }
    if (!hasHeader || !hasData || !hasEnd) return null;
  } else if (mimeType === "image/jpeg") {
    if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return null;
    const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    let hasFrame = false;
    let hasScan = false;
    while (offset < bytes.length - 2) {
      if (bytes[offset] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset];
      offset += 1;
      if (marker === undefined || marker === 0x00 || marker === 0xd8 || marker === 0xd9) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const segmentLength = (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0);
      if (segmentLength < 2 || segmentLength > bytes.length - offset) return null;
      const dataOffset = offset + 2;
      if (marker === 0xe1) return null; // Reject EXIF/XMP APP1 metadata; the client canvas should have stripped it.
      if (frameMarkers.has(marker)) {
        if (segmentLength < 8 || hasFrame) return null;
        height = (bytes[dataOffset + 1] ?? 0) * 256 + (bytes[dataOffset + 2] ?? 0);
        width = (bytes[dataOffset + 3] ?? 0) * 256 + (bytes[dataOffset + 4] ?? 0);
        hasFrame = true;
      }
      if (marker === 0xda) {
        hasScan = hasFrame;
        break;
      }
      offset += segmentLength;
    }
    if (!hasFrame || !hasScan) return null;
  } else if (mimeType === "image/webp") {
    if (bytes.length < 30 || String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF"
      || String.fromCharCode(...bytes.subarray(8, 12)) !== "WEBP" || readU32LE(bytes, 4) !== bytes.length - 8) return null;
    let offset = 12;
    let imageChunkCount = 0;
    let hasExtendedHeader = false;
    while (offset + 8 <= bytes.length) {
      const kind = String.fromCharCode(...bytes.subarray(offset, offset + 4));
      const length = readU32LE(bytes, offset + 4);
      if (length < 0 || length > bytes.length - offset - 8) return null;
      const data = offset + 8;
      if (kind === "EXIF" || kind === "XMP " || kind === "ANIM" || kind === "ANMF") return null;
      if (kind === "VP8X") {
        if (length < 10 || hasExtendedHeader || ((bytes[data] ?? 0) & 0x02) !== 0) return null;
        width = 1 + (bytes[data + 4] ?? 0) + ((bytes[data + 5] ?? 0) << 8) + ((bytes[data + 6] ?? 0) << 16);
        height = 1 + (bytes[data + 7] ?? 0) + ((bytes[data + 8] ?? 0) << 8) + ((bytes[data + 9] ?? 0) << 16);
        hasExtendedHeader = true;
      } else if (kind === "VP8 ") {
        if (length < 10 || (bytes[data] ?? 1) & 1 || bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) return null;
        const frameWidth = ((bytes[data + 6] ?? 0) | ((bytes[data + 7] ?? 0) << 8)) & 0x3fff;
        const frameHeight = ((bytes[data + 8] ?? 0) | ((bytes[data + 9] ?? 0) << 8)) & 0x3fff;
        if (hasExtendedHeader && (width !== frameWidth || height !== frameHeight)) return null;
        width = frameWidth;
        height = frameHeight;
        imageChunkCount += 1;
      } else if (kind === "VP8L") {
        if (length < 5 || bytes[data] !== 0x2f) return null;
        const packedWidth = bytes[data + 1] ?? 0;
        const packed = bytes[data + 2] ?? 0;
        const frameWidth = 1 + packedWidth + ((packed & 0x3f) << 8);
        const frameHeight = 1 + ((packed >> 6) & 0x03) + ((bytes[data + 3] ?? 0) << 2) + (((bytes[data + 4] ?? 0) & 0x0f) << 10);
        if (hasExtendedHeader && (width !== frameWidth || height !== frameHeight)) return null;
        width = frameWidth;
        height = frameHeight;
        imageChunkCount += 1;
      }
      offset += 8 + length + (length & 1);
    }
    if (offset !== bytes.length || imageChunkCount !== 1) return null;
  } else {
    return null;
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > MAX_AVATAR_DIMENSION || height > MAX_AVATAR_DIMENSION || width * height > MAX_AVATAR_PIXELS) return null;
  return { width, height };
}

function decodeAvatar(mimeType: unknown, encoded: unknown): Uint8Array | null {
  if (typeof mimeType !== "string" || !["image/png", "image/jpeg", "image/webp"].includes(mimeType)) return null;
  if (typeof encoded !== "string" || encoded.length === 0 || encoded.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4) return null;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return null;
  try {
    const binary = atob(encoded);
    if (binary.length > MAX_AVATAR_BYTES || btoa(binary) !== encoded) return null;
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return avatarDimensions(mimeType, bytes) ? bytes : null;
  } catch {
    return null;
  }
}

async function rateLimitPair(
  env: Env,
  request: Request,
  email: string,
  prefix: string,
  now: number,
  ipLimit: number,
  emailLimit: number,
): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  await env.DB.prepare("DELETE FROM rate_limits WHERE window_started_at < ?").bind(now - 24 * 60 * 60 * 1000).run();
  const [ipBucket, emailBucket] = await Promise.all([
    hmacHex(env.AUTH_CODE_PEPPER, ip),
    hmacHex(env.AUTH_CODE_PEPPER, email),
  ]);
  const [ipAllowed, emailAllowed] = await Promise.all([
    enforceRateLimit(env, `${prefix}-ip:${ipBucket}`, now, 60 * 60 * 1000, ipLimit),
    enforceRateLimit(env, `${prefix}-email:${emailBucket}`, now, 60 * 60 * 1000, emailLimit),
  ]);
  return ipAllowed && emailAllowed;
}

async function rateLimitAccountAction(
  env: Env,
  request: Request,
  account: AccountRow,
  prefix: string,
  now: number,
  limit: number,
): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const [ipBucket, accountBucket] = await Promise.all([
    hmacHex(env.AUTH_CODE_PEPPER, ip),
    hmacHex(env.AUTH_CODE_PEPPER, account.id),
  ]);
  await env.DB.prepare("DELETE FROM rate_limits WHERE window_started_at < ?").bind(now - 24 * 60 * 60 * 1000).run();
  const [ipAllowed, accountAllowed] = await Promise.all([
    enforceRateLimit(env, `${prefix}-ip:${ipBucket}`, now, 60 * 60 * 1000, limit),
    enforceRateLimit(env, `${prefix}-account:${accountBucket}`, now, 60 * 60 * 1000, limit),
  ]);
  return ipAllowed && accountAllowed;
}

async function linkFirebaseAccount(env: Env, email: string, firebaseUid: string, now: number): Promise<AccountRow | null> {
  if (!firebaseUid || firebaseUid.length > 128) return null;
  await env.DB.prepare(
    `INSERT INTO accounts (id, email, firebase_uid, credential_version, display_name, created_at)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(email) DO NOTHING`,
  ).bind(crypto.randomUUID(), email, firebaseUid, defaultDisplayName(email), now).run();
  let account = await env.DB.prepare("SELECT id, email, firebase_uid, credential_version, display_name FROM accounts WHERE email = ?")
    .bind(email).first<AccountRow>();
  if (!account || (account.firebase_uid && account.firebase_uid !== firebaseUid)) return null;
  if (!account.firebase_uid) {
    await env.DB.prepare("UPDATE OR IGNORE accounts SET firebase_uid = ?, credential_version = credential_version + 1 WHERE id = ? AND firebase_uid IS NULL")
      .bind(firebaseUid, account.id).run();
    account = await env.DB.prepare("SELECT id, email, firebase_uid, credential_version, display_name FROM accounts WHERE id = ?")
      .bind(account.id).first<AccountRow>();
  }
  return account?.firebase_uid === firebaseUid ? account : null;
}

async function passwordLogin(request: Request, env: Env): Promise<Response> {
  const body = await requestJson(request);
  const email = normalizedEmail(body?.email);
  const password = body?.password;
  if (!email || typeof password !== "string" || password.length > 2048) return fail(401, "INVALID_CREDENTIALS");

  const now = Date.now();
  if (!(await rateLimitPair(env, request, email, "password-login", now, 40, 8))) return fail(429, "RATE_LIMITED");
  const previous = await env.DB.prepare("SELECT id, email, firebase_uid, credential_version, display_name FROM accounts WHERE email = ?")
    .bind(email).first<AccountRow>();
  const startingVersion = previous?.credential_version ?? 0;
  const auth = await firebaseRequest(env, "accounts:signInWithPassword", {
    email,
    password,
    returnSecureToken: true,
  });
  if (!auth.ok) {
    if (firebaseUnavailable(auth)) return fail(503, "AUTH_PROVIDER_UNAVAILABLE");
    return fail(401, "INVALID_CREDENTIALS");
  }
  const firebaseUid = typeof auth.data.localId === "string" ? auth.data.localId : "";
  const firebaseEmail = normalizedEmail(auth.data.email);
  if (!firebaseUid || firebaseEmail !== email) return fail(401, "INVALID_CREDENTIALS");

  // Do not link an unclaimed legacy account until the mailbox challenge has
  // been consumed. Otherwise possession of only the Firebase password could
  // disable its legacy email-code sign-in before the second factor succeeds.
  await env.DB.prepare(
    "INSERT INTO accounts (id, email, display_name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING",
  ).bind(crypto.randomUUID(), email, defaultDisplayName(email), now).run();
  const account = await env.DB.prepare("SELECT id, email, firebase_uid, credential_version, display_name FROM accounts WHERE email = ?")
    .bind(email).first<AccountRow>();
  if (!account || (account.credential_version ?? 0) !== startingVersion
    || (account.firebase_uid && account.firebase_uid !== firebaseUid)) return fail(401, "INVALID_CREDENTIALS");

  const challengeId = randomHex(32);
  const tokenHash = await hmacHex(env.SESSION_PEPPER, `login-challenge:${challengeId}`);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const codeHash = await hmacHex(env.AUTH_CODE_PEPPER, `${email}\0${challengeId}\0${code}`);
  const expiresAt = now + LOGIN_CHALLENGE_TTL_MS;
  await env.DB.prepare("DELETE FROM login_challenges WHERE account_id = ?").bind(account.id).run();
  await env.DB.prepare(
    `INSERT INTO login_challenges
      (token_hash, account_id, firebase_uid, code_hash, credential_version, expires_at, attempts, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
  ).bind(tokenHash, account.id, firebaseUid, codeHash, startingVersion, expiresAt, now).run();
  try {
    if (!(await sendCode(env, email, code))) {
      await env.DB.prepare("DELETE FROM login_challenges WHERE token_hash = ?").bind(tokenHash).run();
      return fail(503, "EMAIL_UNAVAILABLE");
    }
  } catch {
    await env.DB.prepare("DELETE FROM login_challenges WHERE token_hash = ?").bind(tokenHash).run();
    return fail(503, "EMAIL_UNAVAILABLE");
  }
  return json({ challengeId, expiresInSeconds: LOGIN_CHALLENGE_TTL_MS / 1000 }, 202);
}

async function verifyPasswordLoginCode(request: Request, env: Env): Promise<Response> {
  const body = await requestJson(request);
  const challengeId = typeof body?.challengeId === "string" ? body.challengeId.trim().toLowerCase() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!/^[a-f0-9]{64}$/.test(challengeId) || !/^\d{6}$/.test(code)) return fail(400, "INVALID_OR_EXPIRED_CODE");

  const now = Date.now();
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const ipBucket = await hmacHex(env.AUTH_CODE_PEPPER, ip);
  if (!(await enforceRateLimit(env, `password-verify-ip:${ipBucket}`, now, 60 * 60 * 1000, 40))) return fail(429, "RATE_LIMITED");

  const tokenHash = await hmacHex(env.SESSION_PEPPER, `login-challenge:${challengeId}`);
  const attempted = await env.DB.prepare(
    `UPDATE login_challenges SET attempts = attempts + 1
     WHERE token_hash = ? AND expires_at > ? AND attempts < ?
     RETURNING account_id, firebase_uid, code_hash, credential_version, attempts`,
  ).bind(tokenHash, now, MAX_CODE_ATTEMPTS).first<{
    account_id: string;
    firebase_uid: string;
    code_hash: string;
    credential_version: number;
    attempts: number;
  }>();
  if (!attempted) {
    await env.DB.prepare("DELETE FROM login_challenges WHERE token_hash = ? AND (expires_at <= ? OR attempts >= ?)")
      .bind(tokenHash, now, MAX_CODE_ATTEMPTS).run();
    return fail(400, "INVALID_OR_EXPIRED_CODE");
  }
  const challenge = await env.DB.prepare(
    `SELECT a.email, a.display_name, lc.code_hash FROM login_challenges lc
     JOIN accounts a ON a.id = lc.account_id WHERE lc.token_hash = ?`,
  ).bind(tokenHash).first<{ email: string; code_hash: string }>();
  if (!challenge) return fail(400, "INVALID_OR_EXPIRED_CODE");
  const submittedHash = await hmacHex(env.AUTH_CODE_PEPPER, `${challenge.email}\0${challengeId}\0${code}`);
  if (!constantTimeEqual(submittedHash, attempted.code_hash)) {
    if (attempted.attempts >= MAX_CODE_ATTEMPTS) {
      await env.DB.prepare("DELETE FROM login_challenges WHERE token_hash = ? AND attempts >= ?")
        .bind(tokenHash, MAX_CODE_ATTEMPTS).run();
    }
    return fail(400, "INVALID_OR_EXPIRED_CODE");
  }

  const consumed = await env.DB.prepare(
    `DELETE FROM login_challenges
     WHERE token_hash = ? AND code_hash = ? AND attempts = ? AND expires_at > ?
     RETURNING account_id, firebase_uid, credential_version`,
  ).bind(tokenHash, attempted.code_hash, attempted.attempts, now).first<{
    account_id: string;
    firebase_uid: string;
    credential_version: number;
  }>();
  if (!consumed) return fail(400, "INVALID_OR_EXPIRED_CODE");
  let account = await env.DB.prepare(
    "SELECT id, email, firebase_uid, credential_version, display_name FROM accounts WHERE id = ? AND credential_version = ?",
  ).bind(consumed.account_id, consumed.credential_version).first<AccountRow>();
  if (!account || (account.firebase_uid && account.firebase_uid !== consumed.firebase_uid)) {
    return fail(400, "INVALID_OR_EXPIRED_CODE");
  }
  if (!account.firebase_uid) {
    const linkedVersion = consumed.credential_version + 1;
    await env.DB.prepare(
      `UPDATE OR IGNORE accounts SET firebase_uid = ?, credential_version = credential_version + 1
       WHERE id = ? AND credential_version = ? AND firebase_uid IS NULL`,
    ).bind(consumed.firebase_uid, account.id, consumed.credential_version).run();
    await env.DB.prepare("DELETE FROM sessions WHERE account_id = ?").bind(account.id).run();
    await env.DB.prepare("DELETE FROM login_challenges WHERE account_id = ?").bind(account.id).run();
    account = await env.DB.prepare(
      "SELECT id, email, firebase_uid, credential_version, display_name FROM accounts WHERE id = ? AND credential_version = ?",
    ).bind(account.id, linkedVersion).first<AccountRow>();
  } else if (account.credential_version !== consumed.credential_version) {
    return fail(400, "INVALID_OR_EXPIRED_CODE");
  }
  if (!account || account.firebase_uid !== consumed.firebase_uid) return fail(400, "INVALID_OR_EXPIRED_CODE");
  const session = await createSession(env, account, now);
  return json({ ...session, account: { email: account.email, displayName: displayNameFor(account), hasPassword: true } });
}

async function requestPasswordEnrollmentCode(request: Request, env: Env): Promise<Response> {
  const body = await requestJson(request);
  const email = normalizedEmail(body?.email);
  if (!email) return fail(400, "INVALID_EMAIL");
  const now = Date.now();
  if (!(await rateLimitPair(env, request, email, "password-enrollment-request", now, 20, 5))) return fail(429, "RATE_LIMITED");

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const codeHash = await hmacHex(env.AUTH_CODE_PEPPER, `password-enrollment:${email}\0${code}`);
  await env.DB.prepare("DELETE FROM password_enrollment_codes WHERE expires_at <= ?").bind(now).run();
  await env.DB.prepare("DELETE FROM password_setup_proofs WHERE expires_at <= ?").bind(now).run();
  await env.DB.prepare(
    `INSERT INTO password_enrollment_codes (email, code_hash, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash,
       expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`,
  ).bind(email, codeHash, now + CODE_TTL_MS, now).run();
  try {
    if (!(await sendCode(env, email, code, "enrollment"))) {
      await env.DB.prepare("DELETE FROM password_enrollment_codes WHERE email = ? AND code_hash = ?")
        .bind(email, codeHash).run();
      return fail(503, "EMAIL_UNAVAILABLE");
    }
  } catch {
    await env.DB.prepare("DELETE FROM password_enrollment_codes WHERE email = ? AND code_hash = ?")
      .bind(email, codeHash).run();
    return fail(503, "EMAIL_UNAVAILABLE");
  }
  return json({ sent: true, expiresInSeconds: CODE_TTL_MS / 1000 }, 202);
}

async function verifyPasswordEnrollmentCode(request: Request, env: Env): Promise<Response> {
  const body = await requestJson(request);
  const email = normalizedEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!email || !/^\d{6}$/.test(code)) return fail(400, "INVALID_OR_EXPIRED_CODE");
  const now = Date.now();
  if (!(await rateLimitPair(env, request, email, "password-enrollment-verify", now, 40, 10))) return fail(429, "RATE_LIMITED");
  const attempted = await env.DB.prepare(
    `UPDATE password_enrollment_codes SET attempts = attempts + 1
     WHERE email = ? AND expires_at > ? AND attempts < ?
     RETURNING code_hash, attempts`,
  ).bind(email, now, MAX_CODE_ATTEMPTS).first<{ code_hash: string; attempts: number }>();
  if (!attempted) {
    await env.DB.prepare("DELETE FROM password_enrollment_codes WHERE email = ? AND (expires_at <= ? OR attempts >= ?)")
      .bind(email, now, MAX_CODE_ATTEMPTS).run();
    return fail(400, "INVALID_OR_EXPIRED_CODE");
  }
  const submittedHash = await hmacHex(env.AUTH_CODE_PEPPER, `password-enrollment:${email}\0${code}`);
  if (!constantTimeEqual(submittedHash, attempted.code_hash)) {
    if (attempted.attempts >= MAX_CODE_ATTEMPTS) {
      await env.DB.prepare("DELETE FROM password_enrollment_codes WHERE email = ? AND attempts >= ?")
        .bind(email, MAX_CODE_ATTEMPTS).run();
    }
    return fail(400, "INVALID_OR_EXPIRED_CODE");
  }
  const consumed = await env.DB.prepare(
    `DELETE FROM password_enrollment_codes WHERE email = ? AND code_hash = ? AND attempts = ?
     RETURNING email`,
  ).bind(email, attempted.code_hash, attempted.attempts).first<{ email: string }>();
  if (!consumed) return fail(400, "INVALID_OR_EXPIRED_CODE");

  const setupToken = randomHex(32);
  const tokenHash = await hmacHex(env.SESSION_PEPPER, `password-setup:${setupToken}`);
  await env.DB.prepare("INSERT INTO password_setup_proofs (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, email, now + PASSWORD_SETUP_PROOF_TTL_MS, now).run();
  return json({ setupToken, expiresInSeconds: PASSWORD_SETUP_PROOF_TTL_MS / 1000 });
}

async function enrollPassword(request: Request, env: Env): Promise<Response> {
  const body = await requestJson(request);
  const email = normalizedEmail(body?.email);
  const setupToken = typeof body?.setupToken === "string" ? body.setupToken.trim().toLowerCase() : "";
  const password = body?.password;
  if (!email || !/^[a-f0-9]{64}$/.test(setupToken)) return fail(400, "INVALID_OR_EXPIRED_SETUP");
  if (!acceptablePassword(password)) return fail(400, "PASSWORD_REQUIREMENTS_NOT_MET");

  const now = Date.now();
  if (!(await rateLimitPair(env, request, email, "password-enrollment-complete", now, 20, 5))) {
    return fail(429, "RATE_LIMITED");
  }
  const tokenHash = await hmacHex(env.SESSION_PEPPER, `password-setup:${setupToken}`);
  const leaseUntil = now + PASSWORD_SETUP_LEASE_MS;
  const proof = await env.DB.prepare(
    `UPDATE password_setup_proofs SET processing_until = ?
     WHERE token_hash = ? AND email = ? AND expires_at > ?
       AND (processing_until IS NULL OR processing_until <= ?)
     RETURNING email`,
  ).bind(leaseUntil, tokenHash, email, now, now).first<{ email: string }>();
  if (!proof) return fail(400, "INVALID_OR_EXPIRED_SETUP");

  const releaseProof = () => env.DB.prepare(
    "UPDATE password_setup_proofs SET processing_until = NULL WHERE token_hash = ? AND email = ? AND processing_until = ?",
  ).bind(tokenHash, email, leaseUntil).run();

  try {
    let firebaseUid = "";
    const signup = await firebaseRequest(env, "accounts:signUp", { email, password, returnSecureToken: true });
    if (signup.ok) {
      firebaseUid = typeof signup.data.localId === "string" ? signup.data.localId : "";
      if (!firebaseUid || normalizedEmail(signup.data.email) !== email) {
        await releaseProof();
        return fail(503, "AUTH_PROVIDER_UNAVAILABLE");
      }
    } else if (signup.errorCode === "EMAIL_EXISTS") {
      // A prior request can create the Firebase identity and then fail while
      // linking D1. The same unexpired mailbox proof plus the submitted
      // password safely recovers that identity; no provider token is retained.
      const existing = await firebaseRequest(env, "accounts:signInWithPassword", {
        email,
        password,
        returnSecureToken: true,
      });
      if (!existing.ok) {
        await releaseProof();
        if (firebaseUnavailable(existing)) return fail(503, "AUTH_PROVIDER_UNAVAILABLE");
        return fail(409, "PASSWORD_ALREADY_SET");
      }
      firebaseUid = typeof existing.data.localId === "string" ? existing.data.localId : "";
      if (!firebaseUid || normalizedEmail(existing.data.email) !== email) {
        await releaseProof();
        return fail(503, "AUTH_PROVIDER_UNAVAILABLE");
      }
    } else {
      await releaseProof();
      if (signup.errorCode === "WEAK_PASSWORD") return fail(400, "PASSWORD_REQUIREMENTS_NOT_MET");
      return fail(503, "AUTH_PROVIDER_UNAVAILABLE");
    }

    const account = await linkFirebaseAccount(env, email, firebaseUid, now);
    if (!account) {
      await releaseProof();
      return fail(503, "ACCOUNT_UNAVAILABLE");
    }
    await env.DB.prepare("DELETE FROM sessions WHERE account_id = ?").bind(account.id).run();
    await env.DB.prepare("DELETE FROM login_challenges WHERE account_id = ?").bind(account.id).run();
    const consumed = await env.DB.prepare(
      `DELETE FROM password_setup_proofs
       WHERE token_hash = ? AND email = ? AND processing_until = ? AND expires_at > ?
       RETURNING email`,
    ).bind(tokenHash, email, leaseUntil, Date.now()).first<{ email: string }>();
    if (!consumed) return fail(400, "INVALID_OR_EXPIRED_SETUP");
    return json({ passwordSet: true });
  } catch {
    // Keep a retry path if Firebase accepted the password but D1 was briefly
    // unavailable. If release also fails, the short lease expires on its own.
    try { await releaseProof(); } catch { /* The lease is time-bounded. */ }
    throw new Error("PASSWORD_ENROLLMENT_UNAVAILABLE");
  }
}

async function requestPasswordReset(request: Request, env: Env): Promise<Response> {
  const body = await requestJson(request);
  const email = normalizedEmail(body?.email);
  if (!email) return fail(400, "INVALID_EMAIL");
  const now = Date.now();
  if (!(await rateLimitPair(env, request, email, "password-reset-request", now, 20, 5))) return fail(429, "RATE_LIMITED");
  const result = await firebaseRequest(env, "accounts:sendOobCode", { requestType: "PASSWORD_RESET", email });
  if (result.errorCode === "CONFIGURATION_MISSING") return fail(503, "AUTH_PROVIDER_UNAVAILABLE");
  if (firebaseUnavailable(result)) return fail(503, "AUTH_PROVIDER_UNAVAILABLE");
  // Firebase's email-enumeration protection may return an error for an unknown email.
  // Keep the same successful response so callers cannot use this route to list accounts.
  return json({ requested: true }, 202);
}

async function completePasswordReset(request: Request, env: Env): Promise<Response> {
  const body = await requestJson(request);
  const oobCode = typeof body?.oobCode === "string" ? body.oobCode.trim() : "";
  const newPassword = body?.newPassword;
  if (!/^\S{10,4096}$/.test(oobCode) || !acceptablePassword(newPassword)) {
    return fail(400, "INVALID_OR_EXPIRED_RESET");
  }
  const now = Date.now();
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const ipBucket = await hmacHex(env.AUTH_CODE_PEPPER, ip);
  await env.DB.prepare("DELETE FROM rate_limits WHERE window_started_at < ?").bind(now - 24 * 60 * 60 * 1000).run();
  if (!(await enforceRateLimit(env, `password-reset-complete-ip:${ipBucket}`, now, 60 * 60 * 1000, 20))) {
    return fail(429, "RATE_LIMITED");
  }
  // First validate the bearer action code without changing the Firebase
  // password. Revoke TomoNode sessions before committing the password change,
  // so a D1 failure can never leave old app sessions valid after Firebase has
  // already accepted the new password.
  const checked = await firebaseRequest(env, "accounts:resetPassword", { oobCode });
  if (!checked.ok) {
    if (firebaseUnavailable(checked)) return fail(503, "AUTH_PROVIDER_UNAVAILABLE");
    return fail(400, "INVALID_OR_EXPIRED_RESET");
  }
  if (checked.data.requestType !== "PASSWORD_RESET") return fail(400, "INVALID_OR_EXPIRED_RESET");
  const email = normalizedEmail(checked.data.email);
  if (!email) return fail(400, "INVALID_OR_EXPIRED_RESET");
  const account = await env.DB.prepare("SELECT id FROM accounts WHERE email = ?").bind(email)
    .first<{ id: string }>();
  if (account) {
    await env.DB.prepare("UPDATE accounts SET credential_version = credential_version + 1 WHERE id = ?")
      .bind(account.id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE account_id = ?").bind(account.id).run();
    await env.DB.prepare("DELETE FROM login_challenges WHERE account_id = ?").bind(account.id).run();
  }
  const completed = await firebaseRequest(env, "accounts:resetPassword", { oobCode, newPassword });
  if (!completed.ok) {
    if (firebaseUnavailable(completed)) return fail(503, "AUTH_PROVIDER_UNAVAILABLE");
    return fail(400, "INVALID_OR_EXPIRED_RESET");
  }
  if (completed.data.requestType !== "PASSWORD_RESET" || normalizedEmail(completed.data.email) !== email) {
    return fail(400, "INVALID_OR_EXPIRED_RESET");
  }
  return json({ passwordChanged: true });
}

function withResetPageCors(request: Request, env: Env, response: Response): Response {
  if (new URL(request.url).pathname !== "/v1/auth/password/complete-reset") return response;
  const origin = request.headers.get("origin");
  if (!origin || !env.APP_BASE_URL) return response;
  let allowedOrigin = "";
  try {
    allowedOrigin = new URL(env.APP_BASE_URL).origin;
  } catch {
    return response;
  }
  if (origin !== allowedOrigin) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  if (request.method === "OPTIONS") {
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set("access-control-allow-headers", "content-type");
    headers.set("access-control-max-age", "600");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
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
    `INSERT INTO sessions (token_hash, account_id, expires_at, created_at, last_used_at, credential_version)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(tokenHash, account.id, expiresAt, now, now, account.credential_version ?? 0).run();
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

  await env.DB.prepare("INSERT INTO accounts (id, email, display_name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING")
    .bind(crypto.randomUUID(), email, defaultDisplayName(email), now).run();
  const account = await env.DB.prepare("SELECT id, email, firebase_uid, credential_version, display_name FROM accounts WHERE email = ?")
    .bind(email).first<AccountRow>();
  if (!account) return fail(500, "ACCOUNT_UNAVAILABLE");

  // Legacy 0.5.7 OTP sessions are kept only for accounts that have not moved
  // to Firebase password authentication. A code must never become a bypass
  // around the password-first challenge flow for an enrolled account.
  if (account.firebase_uid) return fail(400, "INVALID_OR_EXPIRED_CODE");

  const session = await createSession(env, account, now);
  return json({ ...session, account: { email: account.email, displayName: displayNameFor(account), hasPassword: false } });
}

async function authenticate(request: Request, env: Env): Promise<SessionRow | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await hmacHex(env.SESSION_PEPPER, token);
  const now = Date.now();
  const session = await env.DB.prepare(
    `SELECT s.token_hash, s.credential_version AS session_credential_version,
       a.id, a.email, a.firebase_uid, a.credential_version, a.display_name
     FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(tokenHash, now).first<SessionRow>();
  if (session && session.credential_version !== session.session_credential_version) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  if (session) await env.DB.prepare("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?").bind(now, tokenHash).run();
  return session;
}

async function currentAccount(request: Request, env: Env): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return fail(401, "SESSION_EXPIRED");
  return json({ email: session.email, displayName: displayNameFor(session), hasPassword: Boolean(session.firebase_uid) });
}

async function updateDisplayName(request: Request, env: Env): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return fail(401, "SESSION_EXPIRED");
  if (!(await rateLimitAccountAction(env, request, session, "profile-name", Date.now(), 20))) return fail(429, "RATE_LIMITED");
  const body = await requestJson(request);
  const displayName = validDisplayName(body?.displayName);
  if (!displayName) return fail(400, "INVALID_DISPLAY_NAME");
  await env.DB.prepare("UPDATE accounts SET display_name = ? WHERE id = ?")
    .bind(displayName, session.id).run();
  return json({ email: session.email, displayName, hasPassword: Boolean(session.firebase_uid) });
}

async function requestPasswordChange(request: Request, env: Env): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return fail(401, "SESSION_EXPIRED");
  if (!(await rateLimitAccountAction(env, request, session, "password-change", Date.now(), 5))) return fail(429, "RATE_LIMITED");
  if (!session.firebase_uid) return fail(409, "PASSWORD_NOT_SET");
  const now = Date.now();
  if (!(await rateLimitPair(env, request, session.email, "password-change-request", now, 20, 5))) {
    return fail(429, "RATE_LIMITED");
  }
  const result = await firebaseRequest(env, "accounts:sendOobCode", {
    requestType: "PASSWORD_RESET",
    email: session.email,
  });
  if (firebaseUnavailable(result)) return fail(503, "AUTH_PROVIDER_UNAVAILABLE");
  // Do not expose Firebase's action code or provider token to the app.
  return json({ requested: true }, 202);
}

async function getAvatar(request: Request, env: Env): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return fail(401, "SESSION_EXPIRED");
  if (!(await rateLimitAccountAction(env, request, session, "avatar-write", Date.now(), 20))) return fail(429, "RATE_LIMITED");
  const row = await env.DB.prepare("SELECT avatar_data, avatar_mime, avatar_updated_at FROM accounts WHERE id = ?")
    .bind(session.id).first<{ avatar_data: ArrayBuffer | Uint8Array | null; avatar_mime: string | null; avatar_updated_at: number | null }>();
  if (!row?.avatar_data || !row.avatar_mime || !["image/png", "image/jpeg", "image/webp"].includes(row.avatar_mime)) {
    return fail(404, "AVATAR_NOT_FOUND");
  }
  const bytes = row.avatar_data instanceof Uint8Array ? new Uint8Array(row.avatar_data) : new Uint8Array(row.avatar_data);
  if (bytes.byteLength > MAX_AVATAR_BYTES || !avatarDimensions(row.avatar_mime, bytes)) return fail(404, "AVATAR_NOT_FOUND");
  return new Response(bytes.buffer, {
    headers: {
      "content-type": row.avatar_mime,
      "content-length": String(bytes.byteLength),
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; sandbox",
      ...(row.avatar_updated_at ? { "x-avatar-updated-at": String(row.avatar_updated_at) } : {}),
    },
  });
}

async function putAvatar(request: Request, env: Env): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return fail(401, "SESSION_EXPIRED");
  if (!(await rateLimitAccountAction(env, request, session, "avatar-write", Date.now(), 20))) return fail(429, "RATE_LIMITED");
  const body = await requestJsonLimit(request, MAX_AVATAR_REQUEST_BYTES);
  if (!body) return fail(400, "INVALID_AVATAR");
  const bytes = decodeAvatar(body.mimeType, body.dataBase64);
  if (!bytes) return fail(400, "INVALID_AVATAR");
  await env.DB.prepare("UPDATE accounts SET avatar_data = ?, avatar_mime = ?, avatar_updated_at = ? WHERE id = ?")
    .bind(bytes, body.mimeType, Date.now(), session.id).run();
  return json({ updated: true });
}

async function deleteAvatar(request: Request, env: Env): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return fail(401, "SESSION_EXPIRED");
  if (!(await rateLimitAccountAction(env, request, session, "avatar-delete", Date.now(), 20))) return fail(429, "RATE_LIMITED");
  await env.DB.prepare("UPDATE accounts SET avatar_data = NULL, avatar_mime = NULL, avatar_updated_at = NULL WHERE id = ?")
    .bind(session.id).run();
  return json({ deleted: true });
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
  let response: Response;
  try {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname === "/v1/auth/password/complete-reset") {
      response = new Response(null, { status: 204 });
    } else if (url.pathname === "/health" && request.method === "GET") {
      response = json({ ok: true });
    } else if (request.method === "POST" && url.pathname === "/v1/auth/request-code") {
      response = await requestCode(request, env);
    } else if (request.method === "POST" && url.pathname === "/v1/auth/verify-code") {
      response = await verifyCode(request, env);
    } else if (request.method === "POST" && url.pathname === "/v1/auth/password/login") {
      response = await passwordLogin(request, env);
    } else if (request.method === "POST" && url.pathname === "/v1/auth/password/verify-login-code") {
      response = await verifyPasswordLoginCode(request, env);
    } else if (request.method === "POST" && url.pathname === "/v1/auth/password/request-enrollment-code") {
      response = await requestPasswordEnrollmentCode(request, env);
    } else if (request.method === "POST" && url.pathname === "/v1/auth/password/verify-enrollment-code") {
      response = await verifyPasswordEnrollmentCode(request, env);
    } else if (request.method === "POST" && url.pathname === "/v1/auth/password/enroll") {
      response = await enrollPassword(request, env);
    } else if (request.method === "POST" && url.pathname === "/v1/auth/password/request-reset") {
      response = await requestPasswordReset(request, env);
    } else if (request.method === "POST" && url.pathname === "/v1/auth/password/complete-reset") {
      response = await completePasswordReset(request, env);
    } else if (request.method === "POST" && url.pathname === "/v1/me/password-reset") {
      response = await requestPasswordChange(request, env);
    } else if (request.method === "POST" && url.pathname === "/v1/auth/logout") {
      response = await signout(request, env);
    } else if (request.method === "GET" && url.pathname === "/v1/me") {
      response = await currentAccount(request, env);
    } else if (request.method === "PATCH" && url.pathname === "/v1/me/display-name") {
      response = await updateDisplayName(request, env);
    } else if (request.method === "GET" && url.pathname === "/v1/me/avatar") {
      response = await getAvatar(request, env);
    } else if (request.method === "PUT" && url.pathname === "/v1/me/avatar") {
      response = await putAvatar(request, env);
    } else if (request.method === "DELETE" && url.pathname === "/v1/me/avatar") {
      response = await deleteAvatar(request, env);
    } else {
      response = fail(404, "NOT_FOUND");
    }
  } catch {
    response = fail(500, "SERVICE_UNAVAILABLE");
  }
  return withResetPageCors(request, env, response);
}

export default { fetch: fetchHandler };
