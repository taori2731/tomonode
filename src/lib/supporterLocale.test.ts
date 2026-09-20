import { describe, expect, it } from "vitest";
import type { AppLocale } from "./i18n";
import { supporterText } from "./supporterLocale";

const locales: readonly AppLocale[] = ["ja", "en", "de", "es", "fr", "ko", "pt-BR", "zh-CN", "zh-TW"];

describe("TomoNode support copy", () => {
  it.each(locales)("provides the complete optional-support copy in %s", (locale) => {
    const copy = supporterText(locale);
    expect(copy.title).toContain("TomoNode");
    expect(copy.intro).toBeTruthy();
    expect(copy.freeFeatures.length).toBeGreaterThan(0);
    expect(copy.candidateFeatures).toEqual(expect.arrayContaining([
      expect.any(String),
    ]));
    expect(copy.pendingTitle).toBeTruthy();
    expect(copy.pendingBody).toBeTruthy();
    expect(copy.availableTitle).toBeTruthy();
    expect(copy.availableBody).toBeTruthy();
    expect(copy.supportButton).toBeTruthy();
    expect(copy.setupGuideLink).toBeTruthy();
    expect(copy.setupGuideBody).toBeTruthy();
    expect(copy.afterStoppingBody).toBeTruthy();
  });

  it("keeps the Japanese support promises explicit", () => {
    const copy = supporterText("ja");
    expect(copy.intro).toContain("全員が無料");
    expect(copy.candidateFeatures).toEqual(expect.arrayContaining([
      "将来追加する新機能の先行体験",
      "開発中の機能へのフィードバック参加",
      "限定デザインやアイコンなどの外観",
    ]));
    expect(copy.pendingTitle).toBe("支援受付は準備中");
    expect(copy.pendingBody).toContain("GitHub Sponsorsの受取設定完了後に利用可能");
    expect(copy.setupGuideLink).toContain("開発者向け");
    expect(copy.afterStoppingBody).toContain("制限しません");
  });
});
