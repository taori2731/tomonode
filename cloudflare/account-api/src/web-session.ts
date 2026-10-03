// Browser persistence is host-only, HTTPS-only, HttpOnly and partitioned by the
// top-level TomoNode site. Native clients continue to use explicit Bearer tokens.
export const WEB_SESSION_COOKIE = "__Host-TomoNodeWebSession";
export const WEB_SESSION_PATH = "/v1/auth/web-session";
export const WEB_CLIENT_HEADER = "x-tomonode-web-client";

export function trustedWebClient(request: Request, appBaseUrl: string): boolean {
  return appBaseUrl === "https://tomonode.site"
    && request.headers.get("origin") === appBaseUrl
    && request.headers.get(WEB_CLIENT_HEADER) === "1";
}

export function webSessionToken(request: Request): string | null {
  const matches = (request.headers.get("cookie") ?? "").split(";")
    .map(part => part.trim()).filter(part => part.startsWith(`${WEB_SESSION_COOKIE}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(WEB_SESSION_COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export function sessionCookie(token: string | null, expiresAt = 0, now = Date.now()): string {
  const maxAge = token ? Math.min(30 * 86400, Math.max(0, Math.floor((expiresAt - now) / 1000))) : 0;
  return `${WEB_SESSION_COOKIE}=${token ?? ""}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=None; Partitioned`;
}

export function withSessionCookie(response: Response, value: string): Response {
  const headers = new Headers(response.headers);
  headers.append("set-cookie", value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
