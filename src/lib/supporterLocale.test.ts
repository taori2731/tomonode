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
    expect(copy.monthlyPrice).toContain("{amount}");
    expect(copy.availableBody).toContain("Stripe");
    expect(JSON.stringify(copy)).not.toContain("GitHub Sponsors");
    expect(copy.afterStoppingBody).toBeTruthy();
  });

  it("keeps the Japanese support promises explicit", () => {
    const copy = supporterText("ja");
    expect(copy.intro).toContain("全員が無料");
    expect(copy.candidateFeatures).toEqual(expect.arrayContaining([
      "提供中の先行体験を任意で利用（現在は対象なし）",
      "標準＋新しい限定テーマ3種類",
      "Discord運営通知（起動完了・停止・異常終了）",
    ]));
    expect(copy.pendingTitle).toBe("Stripeの応援プランは準備中");
    expect(copy.pendingBody).toContain("本番受付は準備中");
    expect(copy.freeFeatures.join()).toContain("3個");
    expect(copy.availableBody).toContain("Stripe");
    expect(copy.afterStoppingBody).toContain("制限しません");
  });
});
