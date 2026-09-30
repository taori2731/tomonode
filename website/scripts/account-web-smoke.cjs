const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.ACCOUNT_QA_BASE_URL || "http://127.0.0.1:4179";
const productionOrigin = "https://tomonode.site";
const isProduction = new URL(baseUrl).origin === productionOrigin;
const apiBase = "https://tomonode-account-api.rafaerunacaya27.workers.dev";
const outputDir = path.resolve(process.env.ACCOUNT_QA_OUTPUT_DIR || path.join(os.tmpdir(), "tomonode-account-auth-qa"));
fs.mkdirSync(outputDir, { recursive: true });
const productionScriptAudits = [];

function response(status, data = {}) {
  return { status, data };
}

async function installApiMock(page, resolver) {
  const calls = [];
  const localBrandAsset = path.resolve(__dirname, "../../public/assets/tomonode-icon-bg-black.png");
  if (!isProduction && fs.existsSync(localBrandAsset)) {
    await page.route(`${new URL(baseUrl).origin}/assets/tomonode-icon-bg-black.png`, async (route) => {
      await route.fulfill({ status: 200, contentType: "image/png", body: fs.readFileSync(localBrandAsset) });
    });
  }
  await page.route(`${apiBase}/**`, async (route) => {
    const request = route.request();
    const origin = request.headers().origin || "*";
    const corsHeaders = {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-max-age": "600",
      vary: "Origin",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    let body = null;
    try { body = request.postDataJSON(); } catch {}
    const entry = {
      method: request.method(),
      url: request.url(),
      pathname: new URL(request.url()).pathname,
      body,
      referer: request.headers().referer || "",
      hasAuthorization: Boolean(request.headers().authorization),
    };
    calls.push(entry);
    const result = await resolver(entry);
    const headers = { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
    await route.fulfill({ status: result.status, headers, body: JSON.stringify(result.data ?? {}) });
  });
  return calls;
}

const cloudflareChallengeTemplate = `(function(){function c(){var b=a.contentDocument||(a.contentWindow&&a.contentWindow.document);if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$params={r:'<request-id>',t:'<timestamp>'};var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);";b.getElementsByTagName('head')[0].appendChild(d)}}if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;a.style.position='absolute';a.style.top=0;a.style.left=0;a.style.border='none';a.style.visibility='hidden';document.body.appendChild(a);if('loading'!==document.readyState)c();else if(window.addEventListener)document.addEventListener('DOMContentLoaded',c);else{var e=document.onreadystatechange||function(){};document.onreadystatechange=function(b){e(b);'loading'!==document.readyState&&(document.onreadystatechange=e,c())}}}})();`;

function inspectProductionHtml(html, pathname) {
  if (!isProduction) return null;

  const expectedAppScripts = new Map([
    ["/account.html", "/account.js"],
    ["/password-reset.html", "/password-reset.js"],
  ]);
  const expectedAppScript = expectedAppScripts.get(pathname);
  assert.ok(expectedAppScript, `production QA is not configured for ${pathname}`);

  const tags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  assert.equal((html.match(/<script\b/gi) || []).length, tags.length, `${pathname} must not contain malformed or unclosed script tags`);
  const externalScripts = [];
  const inlineScripts = [];
  for (const [, attributes, body] of tags) {
    const src = attributes.match(/(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (src) externalScripts.push(src[1] ?? src[2] ?? src[3]);
    else inlineScripts.push(body);
  }
  assert.deepEqual(externalScripts, [expectedAppScript], `${pathname} must only load its same-origin app script`);
  assert.ok(inlineScripts.length <= 1, `${pathname} must not contain unknown inline scripts`);
  const cspMeta = html.match(/<meta\b(?=[^>]*http-equiv=(["'])Content-Security-Policy\1)[^>]*content=(["'])(.*?)\2[^>]*>/i);
  assert.ok(cspMeta, `${pathname} must retain its page Content Security Policy`);
  assert.match(cspMeta[3], /(?:^|;)\s*script-src\s+'self'(?:\s|;|$)/i, `${pathname} must keep script-src restricted to self`);
  assert.doesNotMatch(cspMeta[3], /unsafe-inline/i, `${pathname} must not relax script-src with unsafe-inline`);
  if (inlineScripts.length === 0) return { inlinePresent: false, sha256Base64: null, pathname, externalScripts };

  const [inline] = inlineScripts;
  const parameterPattern = /window\.__CF\$cv\$params=\{r:'([a-f0-9]{16})',t:'([A-Za-z0-9+/]{10,}={0,2})'\}/g;
  const parameterMatches = [...inline.matchAll(parameterPattern)];
  assert.equal(parameterMatches.length, 1, `${pathname} Cloudflare challenge must contain exactly one changing request/timestamp pair`);
  const normalized = inline.replace(parameterPattern, "window.__CF$cv$params={r:'<request-id>',t:'<timestamp>'}");
  assert.equal(normalized, cloudflareChallengeTemplate, `${pathname} contains an unrecognized inline script; only the known Cloudflare edge challenge is allowed`);

  return {
    inlinePresent: true,
    sha256Base64: crypto.createHash("sha256").update(inline, "utf8").digest("base64"),
    pathname,
    externalScripts,
  };
}

async function createPage(browser, { route, url, viewport = { width: 1280, height: 900 }, locale = "ja-JP" }) {
  const context = await browser.newContext({ viewport, locale });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push({ source: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ source: "console", message: message.text() });
  });
  const calls = await installApiMock(page, route);
  const response = await page.goto(`${baseUrl}${url}`, { waitUntil: "load" });
  const html = response ? await response.text() : "";
  const pagePath = new URL(url, baseUrl).pathname;
  const cloudflareCsp = inspectProductionHtml(html, pagePath);
  if (cloudflareCsp) productionScriptAudits.push(cloudflareCsp);
  return { context, page, calls, consoleErrors, cloudflareCsp };
}

async function assertVisible(locator, message) {
  await locator.waitFor({ state: "visible", timeout: 5000 });
  assert.equal(await locator.isVisible(), true, message);
}

function isRecognizedCloudflareCspRefusal(error, cloudflareCsp) {
  if (!cloudflareCsp?.inlinePresent || error.source !== "console") return false;
  const { message } = error;
  return message.startsWith("Executing inline script violates the following Content Security Policy directive ")
    && message.includes("directive 'script-src 'self''")
    && message.includes(`'sha256-${cloudflareCsp.sha256Base64}'`)
    && message.endsWith("The action has been blocked.");
}

async function assertNoBrowserErrors(consoleErrors, label, expectedMessages = [], cloudflareCsp = null) {
  const recognizedCloudflareErrors = consoleErrors.filter((error) => isRecognizedCloudflareCspRefusal(error, cloudflareCsp));
  if (cloudflareCsp) {
    const expectedCloudflareRefusals = cloudflareCsp.inlinePresent ? 1 : 0;
    assert.equal(recognizedCloudflareErrors.length, expectedCloudflareRefusals, `${label} must report exactly ${expectedCloudflareRefusals} CSP refusal(s) matching known Cloudflare inline content`);
  }
  const unexpected = consoleErrors.filter((error) => !isRecognizedCloudflareCspRefusal(error, cloudflareCsp)
    && !expectedMessages.some((expected) => error.message.includes(expected)));
  assert.deepEqual(unexpected, [], `${label} browser errors: ${unexpected.map((error) => `${error.source}: ${error.message}`).join(" | ")}`);
}

async function desktopConsentFlow(browser) {
  const id = "a1".repeat(16);
  const requests = [];
  const { context, page, calls, consoleErrors, cloudflareCsp } = await createPage(browser, {
    url: `/account.html?request=${id}&mode=login&lang=en`,
    locale: "en-US",
    route: async (request) => {
      requests.push(request);
      if (request.pathname === "/v1/auth/browser/request" && request.method === "GET") return response(200, { userCode: "ABCD-EFGH", expiresInSeconds: 600, status: "pending" });
      if (request.pathname === "/v1/auth/password/login") return response(202, { challengeId: "1".repeat(64), expiresInSeconds: 600 });
      if (request.pathname === "/v1/auth/password/verify-login-code") return response(200, { accessToken: "2".repeat(64), account: { email: "member@example.com", displayName: "Member", hasPassword: true } });
      if (request.pathname === "/v1/auth/browser/approve") return response(200, { approved: true });
      return response(404, { error: "NOT_FOUND" });
    },
  });
  try {
    assert.match(await page.title(), /Sign in to TomoNode/);
    await assertVisible(page.locator("#pairing-panel"), "pairing panel should be visible");
    await assertVisible(page.locator("#login-view"), "login should be the initial view");
    assert.equal(new URL(page.url()).search, "", "pairing request must be removed from the visible URL");
    assert.equal(await page.locator("#pairing-code").textContent(), "ABCD-EFGH");
    const initialScreenshot = path.join(outputDir, "desktop-login.png");
    await page.screenshot({ path: initialScreenshot });

    await page.locator("#login-email").fill("member@example.com");
    await page.locator("#login-password").fill("secret6");
    await page.locator("#login-form button[type=submit]").click();
    await assertVisible(page.locator("#login-code-view"), "email OTP view should follow password login");
    assert.equal(await page.locator("#login-password").inputValue(), "", "password should be cleared after challenge creation");
    assert.equal(requests.filter((item) => item.pathname === "/v1/auth/browser/approve").length, 0, "pairing must not auto-approve");

    await page.locator("#login-code").fill("123456");
    await page.locator("#login-code-form button[type=submit]").click();
    await assertVisible(page.locator("#consent-view"), "successful OTP should show explicit consent");
    assert.equal(await page.locator("#consent-email").textContent(), "member@example.com");
    assert.equal(await page.locator("#consent-user-code").textContent(), "ABCD-EFGH");
    const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
    assert.deepEqual(storage, { local: 0, session: 0 }, "session token must not be stored in web storage");
    const consentScreenshot = path.join(outputDir, "desktop-consent.png");
    await page.screenshot({ path: consentScreenshot });

    await page.getByRole("button", { name: "Sign in to this app" }).click();
    await assertVisible(page.locator("#complete-view"), "approval should show completion");
    assert.match(await page.locator("#completion-copy").textContent(), /Sign-in to the TomoNode desktop app is approved/);
    assert.equal(await page.locator("#completion-login").isVisible(), false, "completed pairing should not offer another login CTA");
    assert.equal(new URL(page.url()).search, "", "no credentials or pairing data may remain in the URL");
    assert.equal(requests.find((item) => item.pathname === "/v1/auth/browser/approve").body.requestId, id);
    assert.equal(requests.find((item) => item.pathname === "/v1/auth/browser/approve").body.userCode, "ABCD-EFGH");
    assert.equal(new URL(requests.find((item) => item.pathname === "/v1/auth/browser/approve").url).search, "");
    assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    await assertNoBrowserErrors(consoleErrors, "desktop consent flow", [], cloudflareCsp);
    return { calls, screenshots: [initialScreenshot, consentScreenshot] };
  } finally {
    await context.close();
  }
}

async function registrationFlow(browser) {
  const { context, page, calls, consoleErrors, cloudflareCsp } = await createPage(browser, {
    url: "/account.html?mode=register&lang=ja",
    locale: "ja-JP",
    route: async (request) => {
      if (request.pathname === "/v1/auth/password/request-enrollment-code") return response(202, { sent: true, expiresInSeconds: 600 });
      if (request.pathname === "/v1/auth/password/verify-enrollment-code") return response(200, { setupToken: "3".repeat(64), expiresInSeconds: 600 });
      if (request.pathname === "/v1/auth/password/enroll") return response(200, {
        passwordSet: true,
        enrolled: true,
        accessToken: "4".repeat(64),
        expiresAt: "2030-01-01T00:00:00.000Z",
        account: { userId: "new-user", email: "new@example.com", createdAt: "2026-09-30T00:00:00.000Z", displayName: null, hasPassword: true },
      });
      return response(404, { error: "NOT_FOUND" });
    },
  });
  try {
    await assertVisible(page.locator("#register-view"), "?mode=register should open registration");
    assert.equal(await page.locator("#login-view").isVisible(), false, "login view should be hidden in registration mode");
    assert.equal(await page.locator("#register-password").getAttribute("minlength"), "6");
    assert.match(await page.locator("#password-requirements").textContent(), /6.*128.*512/);
    await page.locator("#register-email").fill("new@example.com");
    await page.locator("#register-password").fill("12345");
    await page.locator("#register-confirm").fill("12345");
    await page.locator("#register-form button[type=submit]").click();
    assert.equal(calls.length, 0, "five-character password must be rejected before API request");
    assert.match(await page.locator("#status").textContent(), /6.*128.*512/);

    await page.locator("#register-password").fill("123456");
    await page.locator("#register-confirm").fill("123456");
    await page.locator("#register-form button[type=submit]").click();
    await assertVisible(page.locator("#register-code-form"), "six-character password should reach email verification");
    assert.equal(await page.locator("#register-form").isVisible(), false);
    assert.equal(calls[0].pathname, "/v1/auth/password/request-enrollment-code");

    await page.locator("#register-code").fill("654321");
    await page.locator("#register-code-form button[type=submit]").click();
    await assertVisible(page.locator("#signed-in-view"), "successful verification and enrollment should sign in immediately");
    assert.equal(await page.locator("#signed-in-email").textContent(), "new@example.com");
    assert.equal(await page.locator("#complete-view").isVisible(), false, "enrollment must not route through a login-again completion view");
    assert.equal(await page.locator("#register-password").inputValue(), "", "enrollment password should be cleared after success");
    assert.equal(await page.locator("#register-confirm").inputValue(), "", "confirmation password should be cleared after success");
    assert.equal(await page.locator("#register-code").inputValue(), "", "email OTP should be cleared after success");
    assert.equal(calls.map((item) => item.pathname).join(","), "/v1/auth/password/request-enrollment-code,/v1/auth/password/verify-enrollment-code,/v1/auth/password/enroll");
    assert.equal(calls[2].body.password, "123456");
    assert.equal(calls.some((item) => item.pathname === "/v1/auth/password/login" || item.pathname === "/v1/auth/password/verify-login-code"), false, "registration must not require a second password or OTP login");
    assert.equal(new URL(page.url()).search, "", "registration must not put session data in the URL");
    assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    const screenshot = path.join(outputDir, "registration-signed-in.png");
    await page.screenshot({ path: screenshot });
    await assertNoBrowserErrors(consoleErrors, "registration flow", [], cloudflareCsp);
    return { calls, screenshot };
  } finally {
    await context.close();
  }
}

async function registrationPairingFlow(browser) {
  const id = "b2".repeat(16);
  const { context, page, calls, consoleErrors, cloudflareCsp } = await createPage(browser, {
    url: `/account.html?request=${id}&mode=register&lang=en`,
    locale: "en-US",
    route: async (request) => {
      if (request.pathname === "/v1/auth/browser/request" && request.method === "GET") return response(200, { userCode: "CDEF-GHJK", expiresInSeconds: 600, status: "pending" });
      if (request.pathname === "/v1/auth/password/request-enrollment-code") return response(202, { sent: true, expiresInSeconds: 600 });
      if (request.pathname === "/v1/auth/password/verify-enrollment-code") return response(200, { setupToken: "5".repeat(64), expiresInSeconds: 600 });
      if (request.pathname === "/v1/auth/password/enroll") return response(200, {
        passwordSet: true,
        enrolled: true,
        accessToken: "6".repeat(64),
        expiresAt: "2030-01-01T00:00:00.000Z",
        account: { userId: "pair-user", email: "pair@example.com", createdAt: "2026-09-30T00:00:00.000Z", displayName: null, hasPassword: true },
      });
      if (request.pathname === "/v1/auth/browser/approve") return response(200, { approved: true });
      return response(404, { error: "NOT_FOUND" });
    },
  });
  try {
    await assertVisible(page.locator("#register-view"), "desktop pairing registration URL should open registration");
    await assertVisible(page.locator("#pairing-panel"), "valid desktop pairing should display its confirmation code");
    await page.locator("#register-email").fill("pair@example.com");
    await page.locator("#register-password").fill("secret6");
    await page.locator("#register-confirm").fill("secret6");
    await page.locator("#register-form button[type=submit]").click();
    await assertVisible(page.locator("#register-code-form"), "pairing registration should request the enrollment code");
    await page.locator("#register-code").fill("123456");
    await page.locator("#register-code-form button[type=submit]").click();
    await assertVisible(page.locator("#consent-view"), "registration should sign in and continue to explicit pairing consent");
    assert.equal(await page.locator("#consent-email").textContent(), "pair@example.com");
    assert.equal(await page.locator("#consent-user-code").textContent(), "CDEF-GHJK");
    assert.equal(calls.filter((item) => item.pathname === "/v1/auth/browser/approve").length, 0, "registration must not automatically approve desktop access");
    assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    await page.getByRole("button", { name: "Sign in to this app" }).click();
    await assertVisible(page.locator("#complete-view"), "only the explicit user action should approve the desktop request");
    assert.equal(calls.map((item) => item.pathname).filter((pathname) => pathname === "/v1/auth/password/login" || pathname === "/v1/auth/password/verify-login-code").length, 0);
    assert.equal(new URL(page.url()).search, "");
    await assertNoBrowserErrors(consoleErrors, "registration to desktop consent flow", [], cloudflareCsp);
    return { calls };
  } finally {
    await context.close();
  }
}

async function resetRequestFlow(browser) {
  const { context, page, calls, consoleErrors, cloudflareCsp } = await createPage(browser, {
    url: "/account.html?lang=en",
    locale: "en-US",
    route: async (request) => request.pathname === "/v1/auth/password/request-reset"
      ? response(202, { sent: true, expiresInSeconds: 600 })
      : response(404, { error: "NOT_FOUND" }),
  });
  try {
    await page.locator("#show-reset").click();
    await assertVisible(page.locator("#reset-view"), "forgot password should open reset request form");
    await page.locator("#reset-email").fill("member@example.com");
    await page.locator("#reset-form button[type=submit]").click();
    await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("If an account matches this address"));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].pathname, "/v1/auth/password/request-reset");
    assert.equal(calls[0].body.email, "member@example.com");
    await assertNoBrowserErrors(consoleErrors, "password reset request", [], cloudflareCsp);
  } finally {
    await context.close();
  }
}

async function resetLinkAndLocales(browser) {
  const invalid = await createPage(browser, {
    url: "/password-reset.html?mode=resetPassword&oobCode=short",
    locale: "ja-JP",
    route: async () => response(404, { error: "NOT_FOUND" }),
  });
  try {
    assert.equal(await invalid.page.locator("#reset-form").isVisible(), false, "short reset link must not show the password form");
    assert.equal(new URL(invalid.page.url()).search, "", "reset action code must be removed from the URL");
    assert.match(await invalid.page.locator("#status").textContent(), /無効か期限切れ/);
    await assertNoBrowserErrors(invalid.consoleErrors, "invalid reset link", [], invalid.cloudflareCsp);
  } finally {
    await invalid.context.close();
  }

  const localeValues = ["ja", "en", "de", "es", "fr", "ko", "pt-BR", "zh-CN", "zh-TW"];
  const { context, page, calls, consoleErrors, cloudflareCsp } = await createPage(browser, {
    url: `/password-reset.html?mode=resetPassword&oobCode=${"x".repeat(32)}`,
    locale: "ja-JP",
    route: async (request) => request.pathname === "/v1/auth/password/complete-reset"
      ? response(410, { error: "INVALID_OR_EXPIRED_CODE" })
      : response(404, { error: "NOT_FOUND" }),
  });
  try {
    await assertVisible(page.locator("#reset-form"), "valid-shaped reset link should show the form");
    assert.equal(new URL(page.url()).search, "");
    assert.equal(await page.locator("#password").getAttribute("minlength"), "6");
    for (const locale of localeValues) {
      await page.locator("#reset-language").selectOption(locale);
      await page.locator("#password").fill("12345");
      await page.locator("#confirm-password").fill("12345");
      await page.locator("#reset-form").dispatchEvent("submit");
      const validation = await page.locator("#status").textContent();
      assert.match(validation, /6/ , `${locale} reset validation should say 6`);
      assert.match(validation, /128/ , `${locale} reset validation should say 128`);
      assert.match(validation, /512/ , `${locale} reset validation should say 512 bytes`);
      assert.equal(calls.length, 0, `${locale} five-character password must not call the API`);
    }
    await page.locator("#password").fill("123456");
    await page.locator("#confirm-password").fill("123456");
    await page.locator("#submit-button").click();
    await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("error") && !document.querySelector("#status")?.textContent.includes("512"));
    assert.equal(calls.length, 1, "six-character password should reach reset completion");
    assert.equal(calls[0].pathname, "/v1/auth/password/complete-reset");
    assert.equal(calls[0].body.newPassword, "123456");
    assert.equal(new URL(calls[0].url).search, "", "reset secret must only be in the POST body, never the endpoint query");
    await assertNoBrowserErrors(consoleErrors, "reset link flow", ["status of 410 (Gone)"], cloudflareCsp);
  } finally {
    await context.close();
  }
}

async function emailChangeCallbackFlow(browser) {
  const oobCode = "email-change-code-0123456789abcdef";
  const { context, page, calls, consoleErrors, cloudflareCsp } = await createPage(browser, {
    url: `/password-reset.html?mode=verifyAndChangeEmail&oobCode=${oobCode}&continueUrl=https%3A%2F%2Fevil.example%2Fkeep`,
    viewport: { width: 390, height: 844 },
    locale: "en-US",
    route: async (request) => request.pathname === "/v1/auth/email-change/complete"
      ? response(200, { emailChanged: true, account: { userId: "member-1", email: "new@example.com", createdAt: "2026-09-30T00:00:00.000Z", displayName: null, hasPassword: true } })
      : response(404, { error: "NOT_FOUND" }),
  });
  try {
    await pageStatusContains(page, "Your email address has changed");
    assert.match(await page.title(), /Change your email address/);
    assert.equal(await page.locator("#reset-form").isVisible(), false, "email-change link must not show the password reset form");
    assert.equal(new URL(page.url()).search, "", "email-change OOB code and continuation parameters must be removed before request");
    assert.equal(calls.length, 1, "email-change link should call only its completion API");
    assert.equal(calls[0].pathname, "/v1/auth/email-change/complete");
    assert.deepEqual(calls[0].body, { oobCode });
    assert.equal(new URL(calls[0].url).search, "", "OOB code must only be sent in the POST body");
    assert.equal(calls[0].referer.includes(oobCode), false, "OOB code must not be sent in the Referer header");
    assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 }, "email-change callback must not store a token");
    const measurements = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.equal(measurements.scrollWidth, measurements.clientWidth, "mobile email-change result must not overflow horizontally");
    const screenshot = path.join(outputDir, "mobile-email-change-390x844.png");
    await page.screenshot({ path: screenshot });
    await assertNoBrowserErrors(consoleErrors, "email-change completion", [], cloudflareCsp);
    return { calls, screenshot };
  } finally {
    await context.close();
  }
}

async function resetRetryFlow(browser) {
  const code = "retry-reset-code-0123456789";
  let attempts = 0;
  const { context, page, calls } = await createPage(browser, {
    url: `/password-reset.html?mode=resetPassword&oobCode=${code}`, locale: "en-US",
    route: async () => ++attempts === 1 ? response(503, { error: "AUTH_PROVIDER_UNAVAILABLE" }) : response(200, { passwordChanged: true }),
  });
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.locator("#password").fill("six123");
      await page.locator("#confirm-password").fill("six123");
      await page.locator("#submit-button").click();
      await page.waitForFunction(() => document.querySelector("#status").classList.contains("error") || document.querySelector("#status").classList.contains("success"));
      assert.equal(await page.locator("#password").inputValue(), "");
    }
    assert.deepEqual(calls.map(x => x.body.oobCode), [code, code], "transient failure must retain the in-memory action code for retry");
    assert.equal(await page.locator("#reset-form").isVisible(), false);
    assert.equal(new URL(page.url()).search, "");
  } finally { await context.close(); }
}

async function emailChangeFailureFlows(browser) {
  const scenarios = [
    { name: "expired email link", status: 400, data: { error: "INVALID_OR_EXPIRED_EMAIL_CHANGE" }, message: "This confirmation link is invalid or expired" },
    { name: "email already in use", status: 409, data: { error: "EMAIL_IN_USE" }, message: "This change could not be completed" },
    { name: "email provider unavailable", status: 503, data: { error: "PROVIDER_UNAVAILABLE" }, message: "Email changes are unavailable" },
    { name: "email identity mismatch", status: 401, data: { error: "IDENTITY_MISMATCH" }, message: "This confirmation link is invalid or expired" },
  ];
  for (const scenario of scenarios) {
    const code = `email-change-${scenario.status}-0123456789`;
    const { context, page, calls, consoleErrors, cloudflareCsp } = await createPage(browser, {
      url: `/password-reset.html?mode=verifyAndChangeEmail&oobCode=${code}`,
      locale: "en-US",
      route: async (request) => request.pathname === "/v1/auth/email-change/complete"
        ? response(scenario.status, scenario.data)
        : response(404, { error: "NOT_FOUND" }),
    });
    try {
      await pageStatusContains(page, scenario.message);
      assert.equal(calls.length, 1, `${scenario.name} should call completion exactly once`);
      assert.equal(calls[0].body.oobCode, code);
      assert.equal(new URL(page.url()).search, "");
      await assertNoBrowserErrors(consoleErrors, scenario.name, [`status of ${scenario.status} (`], cloudflareCsp);
    } finally {
      await context.close();
    }
  }

  const malformed = await createPage(browser, {
    url: "/password-reset.html?mode=verifyAndChangeEmail&oobCode=short",
    locale: "en-US",
    route: async () => response(404, { error: "NOT_FOUND" }),
  });
  try {
    assert.match(await malformed.page.locator("#status").textContent(), /invalid or has expired/i);
    assert.equal(malformed.calls.length, 0, "malformed email-change code must not be sent to the Worker");
    assert.equal(new URL(malformed.page.url()).search, "", "malformed callback query must also be cleared");
    await assertNoBrowserErrors(malformed.consoleErrors, "malformed email-change link", [], malformed.cloudflareCsp);
  } finally {
    await malformed.context.close();
  }
}

async function recoverEmailHandoffFlow(browser) {
  const apiKey = `AIza${"a".repeat(35)}`;
  const oobCode = "recover-email-code-0123456789abcdef";
  const { context, page, calls, consoleErrors, cloudflareCsp } = await createPage(browser, {
    url: `/password-reset.html?mode=recoverEmail&oobCode=${oobCode}&apiKey=${apiKey}&lang=zh-CN&continueUrl=https%3A%2F%2Fevil.example%2Fcollect&tenantId=attacker&projectId=attacker`,
    locale: "en-US",
    route: async () => response(404, { error: "NOT_FOUND" }),
  });
  const handoffs = [];
  try {
    await pageStatusContains(page, "点击按钮打开 Firebase 官方页面");
    const button = page.locator("#recovery-handoff");
    await assertVisible(button, "valid recoverEmail link should offer a manual Firebase handoff");
    assert.equal(new URL(page.url()).search, "", "all inbound recovery parameters must be removed before the explicit handoff");
    assert.equal(calls.length, 0, "recoverEmail must not be sent to the email-change Worker endpoint");
    await page.route("https://tomonode-auth.firebaseapp.com/**", async (route) => {
      const request = route.request();
      handoffs.push({ url: request.url(), referer: request.headers().referer || "" });
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><title>Mock Firebase action</title>" });
    });
    await button.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("https://tomonode-auth.firebaseapp.com/__/auth/action**");
    assert.equal(handoffs.length, 1, "Firebase action page must only open after the user activates the button");
    const destination = new URL(handoffs[0].url);
    assert.equal(destination.origin, "https://tomonode-auth.firebaseapp.com");
    assert.equal(destination.pathname, "/__/auth/action");
    assert.deepEqual([...destination.searchParams.keys()].sort(), ["apiKey", "lang", "mode", "oobCode"]);
    assert.equal(destination.searchParams.get("mode"), "recoverEmail");
    assert.equal(destination.searchParams.get("oobCode"), oobCode);
    assert.equal(destination.searchParams.get("apiKey"), apiKey);
    assert.equal(destination.searchParams.get("lang"), "zh-CN");
    assert.equal(handoffs[0].referer.includes(oobCode), false, "recovery code must not be sent as a Referer");
    assert.equal(calls.length, 0, "recoverEmail must never call email-change/complete");
    await assertNoBrowserErrors(consoleErrors, "recoverEmail Firebase handoff", [], cloudflareCsp);
  } finally {
    await context.close();
  }

  const invalidApiKey = await createPage(browser, {
    url: `/password-reset.html?mode=recoverEmail&oobCode=${oobCode}&apiKey=not-a-firebase-key&continueUrl=https%3A%2F%2Fevil.example`,
    locale: "en-US",
    route: async () => response(404, { error: "NOT_FOUND" }),
  });
  try {
    await pageStatusContains(invalidApiKey.page, "could not be verified safely");
    assert.equal(await invalidApiKey.page.locator("#recovery-handoff").isVisible(), false, "invalid apiKey must not enable outbound recovery navigation");
    assert.equal(invalidApiKey.calls.length, 0);
    assert.equal(new URL(invalidApiKey.page.url()).search, "");
    await assertNoBrowserErrors(invalidApiKey.consoleErrors, "invalid recoverEmail apiKey", [], invalidApiKey.cloudflareCsp);
  } finally {
    await invalidApiKey.context.close();
  }
}

async function expiredAndInvalidPairing(browser) {
  const invalid = await createPage(browser, {
    url: "/account.html?request=not-a-request&mode=login&lang=en",
    locale: "en-US",
    route: async () => response(404, { error: "NOT_FOUND" }),
  });
  try {
    await pageStatusContains(invalid.page, "invalid or expired");
    assert.equal(invalid.calls.length, 0, "malformed request id must not be sent to the API");
    assert.equal(new URL(invalid.page.url()).search, "");
    await assertNoBrowserErrors(invalid.consoleErrors, "malformed pairing link", [], invalid.cloudflareCsp);
  } finally {
    await invalid.context.close();
  }

  const expired = await createPage(browser, {
    url: `/account.html?request=${"e".repeat(32)}&mode=login&lang=en`,
    locale: "en-US",
    route: async () => response(410, { error: "BROWSER_AUTH_EXPIRED" }),
  });
  try {
    await pageStatusContains(expired.page, "already used or has expired");
    assert.equal(await expired.page.locator("#pairing-panel").isVisible(), false);
    assert.equal(new URL(expired.page.url()).search, "");
    await assertNoBrowserErrors(expired.consoleErrors, "expired pairing link", ["status of 410 (Gone)"], expired.cloudflareCsp);
  } finally {
    await expired.context.close();
  }
}

async function pageStatusContains(page, text) {
  await page.waitForFunction((expected) => document.querySelector("#status")?.textContent.toLowerCase().includes(expected.toLowerCase()), text);
}

async function mobileLayout(browser) {
  const { context, page, consoleErrors, cloudflareCsp } = await createPage(browser, {
    url: "/account.html?lang=ja",
    viewport: { width: 390, height: 844 },
    locale: "ja-JP",
    route: async () => response(404, { error: "NOT_FOUND" }),
  });
  try {
    await assertVisible(page.locator("#login-view"), "mobile login should render");
    const measurements = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      card: document.querySelector(".account-card").getBoundingClientRect().toJSON(),
      imageLoaded: document.querySelector(".brand img").naturalWidth > 0,
      eye: document.querySelector(".visibility-toggle").getBoundingClientRect().toJSON(),
    }));
    assert.equal(measurements.scrollWidth, measurements.clientWidth, "mobile page must not overflow horizontally");
    assert.ok(measurements.card.left >= 0 && measurements.card.right <= measurements.clientWidth, "card must fit the mobile viewport");
    assert.equal(measurements.imageLoaded, true, "TomoNode logo should load");
    assert.ok(measurements.eye.width >= 44 && measurements.eye.height >= 44, "password visibility control should meet the 44px target");
    const screenshot = path.join(outputDir, "mobile-login-390x844.png");
    await page.screenshot({ path: screenshot });
    await assertNoBrowserErrors(consoleErrors, "mobile layout", [], cloudflareCsp);
    return screenshot;
  } finally {
    await context.close();
  }
}

(async () => {
  const browserExecutable = [
    chromium.executablePath(),
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find((candidate) => fs.existsSync(candidate));
  if (!browserExecutable) throw new Error("No Playwright Chromium, Chrome, or Edge executable is available.");
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
  try {
    const desktop = await desktopConsentFlow(browser);
    const registration = await registrationFlow(browser);
    const registrationPairing = await registrationPairingFlow(browser);
    await resetRequestFlow(browser);
    await resetLinkAndLocales(browser);
    await resetRetryFlow(browser);
    const emailChange = await emailChangeCallbackFlow(browser);
    await emailChangeFailureFlows(browser);
    await recoverEmailHandoffFlow(browser);
    await expiredAndInvalidPairing(browser);
    const mobileScreenshot = await mobileLayout(browser);
    console.log("Playwright mocked auth QA PASS");
    console.log("Flows: desktop login + OTP + explicit pairing consent; register 5 reject/6 accept + email OTP + enrollment autologin; registration-to-desktop explicit consent; generic reset request; reset 5 reject/6 API + expired/invalid links; email-change success/invalid/expired/identity/collision/provider/network handling; safe recoverEmail Firebase handoff; malformed/expired desktop request; no session tokens in browser storage.");
    console.log(`Mobile viewport: 390x844, no horizontal overflow, logo loaded, eye target 44px; screenshot ${mobileScreenshot}`);
    console.log(`Desktop screenshots: ${desktop.screenshots.join("; ")}`);
    console.log(`Signed-in registration screenshot: ${registration.screenshot}`);
    console.log(`Email-change mobile screenshot: ${emailChange.screenshot}`);
    console.log(`Registration API sequence: ${registration.calls.map((item) => item.pathname).join(" -> ")}`);
    console.log(`Registration pairing API sequence: ${registrationPairing.calls.map((item) => item.pathname).join(" -> ")}`);
    if (isProduction) {
      const auditedPaths = [...new Set(productionScriptAudits.map((audit) => audit.pathname))].join(", ");
      const challengeCount = productionScriptAudits.filter((audit) => audit.inlinePresent).length;
      console.log(`Production HTML script audit PASS: ${productionScriptAudits.length} responses (${auditedPaths}); only each page's same-origin app script plus ${challengeCount} recognized Cloudflare challenge inline(s); every present challenge hash matched its sole CSP refusal; strict script-src 'self' retained.`);
    } else {
      console.log("Production-only Cloudflare CSP exception disabled for this non-production origin.");
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
