const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.ACCOUNT_QA_BASE_URL || "http://127.0.0.1:4179";
const apiBase = "https://tomonode-account-api.rafaerunacaya27.workers.dev";
const outputDir = path.resolve(process.env.ACCOUNT_QA_OUTPUT_DIR || path.join(os.tmpdir(), "tomonode-account-auth-qa"));
fs.mkdirSync(outputDir, { recursive: true });

function response(status, data = {}) {
  return { status, data };
}

async function installApiMock(page, resolver) {
  const calls = [];
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
    const entry = { method: request.method(), url: request.url(), pathname: new URL(request.url()).pathname, body };
    calls.push(entry);
    const result = await resolver(entry);
    const headers = { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
    await route.fulfill({ status: result.status, headers, body: JSON.stringify(result.data ?? {}) });
  });
  return calls;
}

async function createPage(browser, { route, url, viewport = { width: 1280, height: 900 }, locale = "ja-JP" }) {
  const context = await browser.newContext({ viewport, locale });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const calls = await installApiMock(page, route);
  await page.goto(`${baseUrl}${url}`, { waitUntil: "load" });
  return { context, page, calls, consoleErrors };
}

async function assertVisible(locator, message) {
  await locator.waitFor({ state: "visible", timeout: 5000 });
  assert.equal(await locator.isVisible(), true, message);
}

async function assertNoBrowserErrors(consoleErrors, label, expectedMessages = []) {
  const unexpected = consoleErrors.filter((message) => !expectedMessages.some((expected) => message.includes(expected)));
  assert.deepEqual(unexpected, [], `${label} browser errors: ${unexpected.join(" | ")}`);
}

async function desktopConsentFlow(browser) {
  const id = "a1".repeat(16);
  const requests = [];
  const { context, page, calls, consoleErrors } = await createPage(browser, {
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
    await assertNoBrowserErrors(consoleErrors, "desktop consent flow");
    return { calls, screenshots: [initialScreenshot, consentScreenshot] };
  } finally {
    await context.close();
  }
}

async function registrationFlow(browser) {
  const { context, page, calls, consoleErrors } = await createPage(browser, {
    url: "/account.html?mode=register&lang=ja",
    locale: "ja-JP",
    route: async (request) => {
      if (request.pathname === "/v1/auth/password/request-enrollment-code") return response(202, { sent: true, expiresInSeconds: 600 });
      if (request.pathname === "/v1/auth/password/verify-enrollment-code") return response(200, { setupToken: "3".repeat(64), expiresInSeconds: 600 });
      if (request.pathname === "/v1/auth/password/enroll") return response(201, { enrolled: true });
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
    await assertVisible(page.locator("#complete-view"), "successful verification and enrollment should complete");
    assert.equal(await page.locator("#register-password").inputValue(), "", "enrollment password should be cleared after success");
    assert.equal(await page.locator("#register-confirm").inputValue(), "", "confirmation password should be cleared after success");
    assert.equal(calls.map((item) => item.pathname).join(","), "/v1/auth/password/request-enrollment-code,/v1/auth/password/verify-enrollment-code,/v1/auth/password/enroll");
    assert.equal(calls[2].body.password, "123456");
    assert.equal(await page.locator("#completion-login").isVisible(), true, "registration should offer a login CTA");
    await page.locator("#completion-login").click();
    await assertVisible(page.locator("#login-view"), "registration CTA should return to login");
    assert.equal(await page.locator("#login-email").inputValue(), "new@example.com");
    assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    await assertNoBrowserErrors(consoleErrors, "registration flow");
    return { calls };
  } finally {
    await context.close();
  }
}

async function resetRequestFlow(browser) {
  const { context, page, calls, consoleErrors } = await createPage(browser, {
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
    await assertNoBrowserErrors(consoleErrors, "password reset request");
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
  } finally {
    await invalid.context.close();
  }

  const localeValues = ["ja", "en", "de", "es", "fr", "ko", "pt-BR", "zh-CN", "zh-TW"];
  const { context, page, calls, consoleErrors } = await createPage(browser, {
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
    await assertNoBrowserErrors(consoleErrors, "reset link flow", ["status of 410 (Gone)"]);
  } finally {
    await context.close();
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
    await assertNoBrowserErrors(expired.consoleErrors, "expired pairing link", ["status of 410 (Gone)"]);
  } finally {
    await expired.context.close();
  }
}

async function pageStatusContains(page, text) {
  await page.waitForFunction((expected) => document.querySelector("#status")?.textContent.toLowerCase().includes(expected.toLowerCase()), text);
}

async function mobileLayout(browser) {
  const { context, page, consoleErrors } = await createPage(browser, {
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
    await assertNoBrowserErrors(consoleErrors, "mobile layout");
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
    await resetRequestFlow(browser);
    await resetLinkAndLocales(browser);
    await expiredAndInvalidPairing(browser);
    const mobileScreenshot = await mobileLayout(browser);
    console.log("Playwright mocked auth QA PASS");
    console.log("Flows: desktop login + OTP + explicit pairing consent; register 5 reject/6 accept + email OTP + enrollment; generic reset request; reset 5 reject/6 API + expired/invalid links; malformed/expired desktop request; no web storage.");
    console.log(`Mobile viewport: 390x844, no horizontal overflow, logo loaded, eye target 44px; screenshot ${mobileScreenshot}`);
    console.log(`Desktop screenshots: ${desktop.screenshots.join("; ")}`);
    console.log(`Registration API sequence: ${registration.calls.map((item) => item.pathname).join(" -> ")}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
