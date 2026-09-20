const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const url = "http://127.0.0.1:1422/";
const chromeCandidates = [
  process.env.PLAYWRIGHT_CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function isReady() {
  try { return (await fetch(url)).ok; } catch { return false; }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await isReady()) return;
    await delay(250);
  }
  throw new Error("Vite preview did not start on port 1422");
}

let preview;
let browser;

(async () => {
  if (!fs.existsSync(path.join(root, "dist", "index.html"))) throw new Error("Run npm run build before the performance smoke test.");
  const viteEntry = path.join(root, "node_modules", "vite", "bin", "vite.js");
  preview = spawn(process.execPath, [viteEntry, "preview", "--port", "1422", "--host", "127.0.0.1", "--strictPort"], { cwd: root, stdio: "ignore", windowsHide: true });
  await waitForServer();

  const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
  browser = await chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("server-hub:language:v1", "ja"));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Survival World" }).waitFor();

  await page.evaluate(() => {
    window.__tomonodeLongTasks = [];
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) window.__tomonodeLongTasks.push(entry.duration);
    }).observe({ type: "longtask", buffered: true });
  });

  const results = [];
  const switchTab = async (name, tab) => {
    const startedAt = Date.now();
    await page.locator(".tabs").getByRole("button", { name }).click();
    await page.locator(`main[data-active-tab="${tab}"] .tab-content`).waitFor({ state: "visible", timeout: 5_000 });
    results.push({ target: `tab:${tab}`, durationMs: Date.now() - startedAt });
  };
  const switchSection = async (name, heading) => {
    const startedAt = Date.now();
    await page.locator(".sidebar-navigation").getByRole("button", { name }).click();
    await page.getByRole("heading", { name: heading }).waitFor({ state: "visible", timeout: 5_000 });
    results.push({ target: `section:${name}`, durationMs: Date.now() - startedAt });
  };

  await switchTab("コンソール", "console");
  await switchTab("プレイヤー", "players");
  await switchTab("ファイル", "files");
  await switchTab("拡張機能", "extensions");
  await switchTab("自動運用", "operations");
  await switchTab("サーバーラボ", "lab");
  await switchTab("安全ツール", "safety");
  await switchTab("設定", "settings");
  await switchSection("ニュース", "ニュース");
  await switchSection("テンプレート", "テンプレート");
  await switchSection("発見", "発見");
  await switchSection("ホーム", "Survival World");

  const longTasks = await page.evaluate(() => window.__tomonodeLongTasks ?? []);
  const report = {
    generatedAt: new Date().toISOString(),
    cpuThrottleRate: 6,
    viewport: { width: 1280, height: 720 },
    maximumSwitchMs: Math.max(...results.map((result) => result.durationMs)),
    switches: results,
    longTasks: {
      count: longTasks.length,
      over500Ms: longTasks.filter((duration) => duration > 500).length,
      maximumMs: longTasks.length ? Math.max(...longTasks) : 0,
    },
  };
  fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
  fs.writeFileSync(path.join(root, "artifacts", "ui-performance-smoke.json"), `${JSON.stringify(report, null, 2)}\n`);

  if (report.maximumSwitchMs > 2_500) throw new Error(`6x CPU throttle switch exceeded 2500 ms: ${JSON.stringify(report)}`);
  if (report.longTasks.over500Ms > 0) throw new Error(`A UI long task exceeded 500 ms under 6x CPU throttle: ${JSON.stringify(report)}`);
  console.log(`UI performance smoke PASS: ${results.length} cold/warm switches at 6x CPU throttle, max ${report.maximumSwitchMs} ms, longest task ${report.longTasks.maximumMs.toFixed(1)} ms`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (preview && !preview.killed) preview.kill();
});
