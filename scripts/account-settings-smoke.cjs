const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const baseUrl = process.env.TOMONODE_SMOKE_URL || "http://127.0.0.1:1420";
const screenshotDir = process.env.TOMONODE_SMOKE_SCREENSHOTS || os.tmpdir();
const profile = {
  email: "player@example.com",
  displayName: "Player001",
  hasPassword: true,
  avatarDataUrl: null,
};

let devServer;

async function ensureServer() {
  try { if ((await fetch(baseUrl)).ok) return; } catch { /* Start a local preview below. */ }
  if (process.env.TOMONODE_SMOKE_URL) throw new Error(`テスト対象へ接続できません: ${baseUrl}`);
  devServer = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "--port", "1420", "--host", "127.0.0.1"], {
    cwd: root, stdio: "ignore", windowsHide: true,
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try { if ((await fetch(baseUrl)).ok) return; } catch { /* Keep waiting. */ }
  }
  throw new Error("テスト用画面が起動しませんでした");
}

async function main() {
  let browser;
  try {
    await ensureServer();
    browser = await chromium.launch({ headless: true, ...(process.env.TOMONODE_CHROME_PATH
      ? { executablePath: process.env.TOMONODE_CHROME_PATH }
      : { channel: "chrome" }) });
    const page = await browser.newPage({ viewport: { width: 1680, height: 940 }, deviceScaleFactor: 1, locale: "en-US" });
    await page.addInitScript(() => localStorage.setItem("server-hub:language:v1", "ja"));
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });

    await page.route(/\/src\/lib\/backend\.ts(?:\?.*)?$/, async (route) => {
      const response = await route.fetch();
      let source = await response.text();
      const sessionSource = 'accountLoadSession: () => desktopOr("account_load_session", { apiBaseUrl: ACCOUNT_API_BASE_URL }, () => null),';
      assert.ok(source.includes(sessionSource), "accountLoadSession のテスト差し替え箇所が見つかりません");
      source = source.replace(sessionSource, `accountLoadSession: () => Promise.resolve(${JSON.stringify(profile)}),`);
      source = source.replace("isDesktop: inDesktop,", "isDesktop: true,");
      await route.fulfill({ response, body: source });
    });

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const migrationNotice = page.locator(".migration-notice-backdrop");
    if (await migrationNotice.isVisible()) await migrationNotice.getByRole("button").click();
    await page.locator(".sidebar-account-card").click();
    const dialog = page.getByRole("dialog", { name: "アカウント設定" });
    await dialog.waitFor();
    await page.getByRole("tab", { name: "プロフィール" }).waitFor();
    assert.equal(await page.getByRole("tab").count(), 3);
    assert.equal(await dialog.getByText("Player001").count(), 1);
    await page.screenshot({ path: path.join(screenshotDir, "tomonode-account-profile-after.png") });

    await page.getByRole("tab", { name: "セキュリティ" }).click();
    await dialog.getByText("2段階認証").waitFor();
    assert.equal(await dialog.getByRole("button", { name: /他の端末からログアウト/ }).isDisabled(), true);
    await page.screenshot({ path: path.join(screenshotDir, "tomonode-account-security-after.png") });

    await page.getByRole("tab", { name: "プラン" }).click();
    await dialog.getByText("Supporter").waitFor();
    assert.equal(await dialog.getByRole("button", { name: /プランを見る/ }).isDisabled(), true);
    assert.equal(await dialog.getByText("¥500").count(), 0);
    await page.screenshot({ path: path.join(screenshotDir, "tomonode-account-plan-after.png") });

    await page.getByRole("tab", { name: "プロフィール" }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await dialog.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390, "モバイル幅でダイアログがはみ出しています");
    await page.screenshot({ path: path.join(screenshotDir, "tomonode-account-mobile-after.png") });

    const avatar = await page.evaluate(async () => {
      const { prepareAvatarUpload } = await import("/src/lib/avatarImage.ts");
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 700;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas が使えません");
      const pixels = context.createImageData(canvas.width, canvas.height);
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        pixels.data[offset] = (offset * 17) % 251;
        pixels.data[offset + 1] = (offset * 31) % 247;
        pixels.data[offset + 2] = (offset * 43) % 239;
        pixels.data[offset + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("PNG を作れません");
      const prepared = await prepareAvatarUpload(new File([blob], "large.png", { type: "image/png" }));
      return { sourceBytes: blob.size, uploadBytes: atob(prepared.dataBase64).length, mimeType: prepared.mimeType };
    });
    assert.ok(avatar.sourceBytes > 128 * 1024, "検査用画像が以前の上限を超えていません");
    assert.ok(avatar.uploadBytes <= 128 * 1024, "変換後の画像が保存上限を超えています");
    assert.deepEqual(pageErrors, [], `ブラウザーエラー: ${pageErrors.join("; ")}`);
    console.log(JSON.stringify({ screenshots: screenshotDir, avatar }, null, 2));
  } finally {
    await browser?.close();
    devServer?.kill();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
