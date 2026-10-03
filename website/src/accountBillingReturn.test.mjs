import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

// Vitest rewrites import.meta.url to an HTTP-like module URL. Resolve from the
// checkout instead so the same test works from the repository root and from a
// standalone website checkout.
const websiteRoot = existsSync(path.join(process.cwd(), "public", "account.html"))
  ? process.cwd()
  : path.resolve(process.cwd(), "website");
const html = readFileSync(path.join(websiteRoot, "public", "account.html"), "utf8");
const script = readFileSync(path.join(websiteRoot, "public", "account.js"), "utf8");

function load(query, route = "/account.html") {
  const dom = new JSDOM(html, { url: `https://tomonode.site${route}${query}`, runScripts: "outside-only", pretendToBeVisual: true });
  const fetch = vi.fn().mockRejectedValue(new Error("No external requests allowed"));
  Object.assign(dom.window, { fetch, TextEncoder });
  dom.window.eval(script);
  return { dom, fetch, document: dom.window.document };
}

describe("Stripe navigation return (not payment verification)", () => {
  it.each(["ja", "en"])("shows safe success guidance in %s without login or any requests", lang => {
    const { dom, fetch, document } = load(`?billing=success&lang=${lang}`);
    try {
      expect(document.querySelector("#billing-return-view").hidden).toBe(false);
      expect(document.querySelector("#login-view").hidden).toBe(true);
      expect(document.documentElement.lang).toBe(lang);
      expect(document.querySelector("#billing-return-view").textContent).toContain(lang === "ja" ? "再購入しないで" : "Do not purchase again");
      expect(document.querySelector("#billing-return-view").textContent).toContain(lang === "ja" ? "証明にはなりません" : "not proof of payment");
      expect(dom.window.location.search).toBe("");
      expect(fetch).not.toHaveBeenCalled();
      expect(dom.window.localStorage.length).toBe(0);
      expect(dom.window.sessionStorage.length).toBe(0);
    } finally { dom.window.close(); }
  });

  it("cancel is not presented as cancellation of a subscription", () => {
    const { dom, fetch, document } = load("?billing=cancel&lang=ja");
    try {
      expect(document.querySelector("#billing-return-note").textContent).toContain("既存の契約は解約されません");
      expect(fetch).not.toHaveBeenCalled();
    } finally { dom.window.close(); }
  });

  it("keeps language switching and optional sign-in usable", () => {
    const { dom, fetch, document } = load("?billing=success&lang=ja");
    try {
      const select = document.querySelector("#language-select");
      select.value = "en";
      select.dispatchEvent(new dom.window.Event("change"));
      expect(document.title).toBe("Check your purchase in the app | TomoNode");
      document.querySelector("#billing-return-login").click();
      expect(document.querySelector("#login-view").hidden).toBe(false);
      expect(document.querySelector("#billing-return-view").hidden).toBe(true);
      expect(document.title).toBe("Sign in to TomoNode | TomoNode");
      expect(fetch).not.toHaveBeenCalled();
    } finally { dom.window.close(); }
  });

  it.each(["?billing=success&billing=cancel", "?billing=unknown", "?billing=%3Cscript%3E", ""])("ignores ambiguous or unknown navigation: %s", query => {
    const { dom, fetch, document } = load(query);
    try {
      expect(document.querySelector("#login-view").hidden).toBe(false);
      expect(document.querySelector("#billing-return-view").hidden).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    } finally { dom.window.close(); }
  });

  it("does not start account pairing on a forged purchase redirect", () => {
    const { dom, fetch } = load("?billing=success&request=" + "a".repeat(32));
    try { expect(fetch).not.toHaveBeenCalled(); }
    finally { dom.window.close(); }
  });

  it("preserves the existing registration entry", () => {
    const { dom, document } = load("?mode=register");
    try { expect(document.querySelector("#register-view").hidden).toBe(false); }
    finally { dom.window.close(); }
  });

  it.each(["/account.html", "/account", "/account/"])("keeps the safe return view on the normalized route %s", route => {
    const { dom, fetch, document } = load("?billing=success&lang=ja", route);
    try {
      expect(document.querySelector("#billing-return-view").hidden).toBe(false);
      expect(document.querySelector("#login-view").hidden).toBe(true);
      expect(dom.window.location.pathname).toBe(route);
      expect(dom.window.location.search).toBe("");
      expect(fetch).not.toHaveBeenCalled();
    } finally { dom.window.close(); }
  });
});
