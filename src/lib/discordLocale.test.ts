import { describe, expect, it } from "vitest";
import { allDiscordLocalesHaveCompleteMessages, discordErrorText, discordText } from "./discordLocale";
import { allSettingsPanelLocalesHaveCompleteMessages, settingsPanelText } from "./settingsPanelLocale";
import { allSupporterPanelLocalesHaveCompleteMessages, supporterPanelText, supporterMembershipState } from "./supporterPanelLocale";
import type { AppLocale } from "./i18n";

const locales: AppLocale[] = ["ja", "en", "zh-CN", "zh-TW", "ko", "es", "de", "fr", "pt-BR"];

describe("localized Discord and supporter settings copy", () => {
  it("has complete typed copy for all nine app locales", () => {
    expect(allDiscordLocalesHaveCompleteMessages()).toBe(true);
    expect(allSupporterPanelLocalesHaveCompleteMessages()).toBe(true);
    expect(allSettingsPanelLocalesHaveCompleteMessages()).toBe(true);
  });

  it("keeps simplified and traditional Chinese copy distinct", () => {
    expect(discordText("zh-CN", "started")).toContain("服务器");
    expect(discordText("zh-TW", "started")).toContain("伺服器");
    expect(settingsPanelText("zh-CN", "discordNav")).toContain("运营");
    expect(settingsPanelText("zh-TW", "discordNav")).toContain("管理");
  });

  it.each(locales.filter((locale) => locale !== "ja"))("does not leave Japanese Kana in core settings text for %s", (locale) => {
    const discordKeys = ["title", "intro", "serverLabel", "destinationLabel", "mentionSettings", "enableNotifications", "timestampHelp", "footer"] as const;
    for (const key of discordKeys) expect(discordText(locale, key)).not.toMatch(/[\u3040-\u30ff]/);
    expect(supporterPanelText(locale, "registeredCount", { count: "1 / 3" })).not.toMatch(/[\u3040-\u30ff]/);
    expect(supporterMembershipState(locale, "expired")).not.toMatch(/[\u3040-\u30ff]/);
  });

  it("maps native error identifiers to localized safe messages", () => {
    expect(discordErrorText("en", new Error("discord.error.role_id_required"))).toContain("role ID");
    expect(discordErrorText("ja", new Error("discord.error.role_id_required"))).toContain("ロールID");
    expect(discordErrorText("fr", new Error("untrusted secret/url response"))).toBe(discordText("fr", "commandFailed"));
  });
});
