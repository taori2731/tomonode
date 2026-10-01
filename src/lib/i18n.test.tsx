import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backend } from "./backend";
import { detectSystemLocale, I18nProvider, readLanguagePreference, useI18n } from "./i18n";

function Probe() {
  const { locale, preference, setPreference, resyncDiscordLocale, t } = useI18n();
  return <><span data-testid="preference">{preference}</span><strong data-testid="locale">{locale}</strong><p>{t("newServer")}</p><button onClick={() => void setPreference("ja").catch(() => undefined)}>日本語</button><button onClick={() => void setPreference("fr").catch(() => undefined)}>Français</button><button onClick={() => void resyncDiscordLocale().catch(() => undefined)}>再同期</button></>;
}

describe("app localization", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("matches common system languages and falls back to English", () => {
    expect(detectSystemLocale(["ja-JP"])).toBe("ja");
    expect(detectSystemLocale(["zh-Hant-TW"])).toBe("zh-TW");
    expect(detectSystemLocale(["pt-PT"])).toBe("pt-BR");
    expect(detectSystemLocale(["ru-RU"])).toBe("en");
  });

  it("uses system mode by default and persists a manual choice", async () => {
    expect(readLanguagePreference()).toBe("system");
    render(<I18nProvider><Probe /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "日本語" }));
    expect(await screen.findByText("新しいサーバー")).toBeInTheDocument();
    expect(localStorage.getItem("server-hub:language:v1")).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
  });

  it("does not persist or display a locale when native notification synchronization fails, and retries safely", async () => {
    localStorage.setItem("server-hub:language:v1", "en");
    let frenchAttempts = 0;
    vi.spyOn(backend, "discordSetLocale").mockImplementation(async (locale) => {
      if (locale === "fr" && frenchAttempts++ === 0) throw new Error("sync failed");
    });
    render(<I18nProvider><Probe /></I18nProvider>);
    await waitFor(() => expect(backend.discordSetLocale).toHaveBeenCalledWith("en"));
    fireEvent.click(screen.getByRole("button", { name: "Français" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("language change was not applied");
    expect(screen.getByTestId("preference")).toHaveTextContent("en");
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(localStorage.getItem("server-hub:language:v1")).toBe("en");

    fireEvent.click(screen.getByRole("button", { name: "再同期" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Français" }));
    expect(await screen.findByText("Nouveau serveur")).toBeInTheDocument();
    expect(screen.getByTestId("preference")).toHaveTextContent("fr");
    expect(localStorage.getItem("server-hub:language:v1")).toBe("fr");
  });

  it("does not let a slower previous locale choice overwrite a newer selection", async () => {
    localStorage.setItem("server-hub:language:v1", "en");
    let resolveFrench!: () => void;
    let resolveJapanese!: () => void;
    vi.spyOn(backend, "discordSetLocale").mockImplementation(async (locale) => {
      if (locale === "fr") await new Promise<void>((resolve) => { resolveFrench = resolve; });
      if (locale === "ja") await new Promise<void>((resolve) => { resolveJapanese = resolve; });
    });
    render(<I18nProvider><Probe /></I18nProvider>);
    await waitFor(() => expect(backend.discordSetLocale).toHaveBeenCalledWith("en"));
    fireEvent.click(screen.getByRole("button", { name: "Français" }));
    await waitFor(() => expect(backend.discordSetLocale).toHaveBeenCalledWith("fr"));
    fireEvent.click(screen.getByRole("button", { name: "日本語" }));
    resolveFrench();
    await waitFor(() => expect(backend.discordSetLocale).toHaveBeenCalledWith("ja"));
    expect(screen.getByTestId("preference")).toHaveTextContent("en");
    resolveJapanese();
    await waitFor(() => expect(screen.getByTestId("preference")).toHaveTextContent("ja"));
    expect(localStorage.getItem("server-hub:language:v1")).toBe("ja");
  });
});
