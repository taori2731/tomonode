import { describe, expect, it } from "vitest";
import { workspaceAnnouncements } from "./workspaceLocale";
import type { AppLocale } from "./i18n";
import packageMetadata from "../../package.json";
import { CURRENT_RELEASE_NEWS_VERSION } from "./releaseNews";

const locales: readonly AppLocale[] = ["ja", "en", "zh-CN", "zh-TW", "ko", "es", "de", "fr", "pt-BR"];

describe("workspace release announcements", () => {
  it("includes the packaged release news in all nine locales", () => {
    expect(CURRENT_RELEASE_NEWS_VERSION).toBe(packageMetadata.version);
    for (const locale of locales) {
      const announcements = workspaceAnnouncements(locale);
      expect(announcements).toHaveLength(5);
      expect(announcements[0].title).toContain(packageMetadata.version);
      expect(announcements[0].date).toBe("2026-10-10");
      expect(announcements[1].date).toBe("2026-10-10");
      expect(announcements[2].date).toBe("2026-10-08");
      expect(announcements.map((item) => item.id)).toEqual([packageMetadata.version, "0.5.17", "0.5.16", "0.5.1", "0.5.0"]);
      expect(new Set(announcements.map((item) => item.id)).size).toBe(announcements.length);
      expect(announcements.every((item) => item.body.trim().length > 0)).toBe(true);
    }
  });

  it("describes checkout permission separately from contract management in Japanese", () => {
    const announcements = workspaceAnnouncements("ja");
    expect(announcements[0].body).toContain("Stripeの受付状態と契約管理");
    expect(announcements[0].body).toContain("サーバーの許可");
    expect(announcements[0].body).toContain("この更新だけでは販売を開始しません");
    expect(announcements[1].body).toContain("通信失敗ではなく接続準備中");
    expect(announcements[1].body).toContain("新規購入は引き続き無効");
    expect(announcements[2].body).toContain("Stripeを開く直前にも再確認");
    expect(announcements[2].body).toContain("既存契約の管理と手動の会員状態再確認は維持");
    expect(announcements[3].body).toContain("固定行数上限をなくし");
    expect(announcements[4].body).toContain("画面外の背景サーバー監視を停止");
  });
});
