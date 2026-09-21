import { describe, expect, it } from "vitest";
import { workspaceAnnouncements } from "./workspaceLocale";
import type { AppLocale } from "./i18n";
import packageMetadata from "../../package.json";
import { CURRENT_RELEASE_NEWS_VERSION } from "./releaseNews";

const locales: readonly AppLocale[] = ["ja", "en", "zh-CN", "zh-TW", "ko", "es", "de", "fr", "pt-BR"];

describe("workspace release announcements", () => {
  it("publishes the packaged release news in all nine locales", () => {
    expect(CURRENT_RELEASE_NEWS_VERSION).toBe(packageMetadata.version);
    for (const locale of locales) {
      const announcements = workspaceAnnouncements(locale);
      expect(announcements).toHaveLength(3);
      expect(announcements[0].title).toContain(packageMetadata.version);
      expect(announcements[0].date).toBe("2026-09-21");
      expect(new Set(announcements.map((item) => item.id)).size).toBe(announcements.length);
      expect(announcements.every((item) => item.body.trim().length > 0)).toBe(true);
    }
  });

  it("describes the current console-history and performance improvements in Japanese", () => {
    const announcements = workspaceAnnouncements("ja");
    expect(announcements[0].body).toContain("固定行数上限をなくし");
    expect(announcements[0].body).toContain("同じログの再比較を省略");
    expect(announcements[0].body).toContain("ログ行とサーバーカードの再描画も抑制");
    expect(announcements[1].body).toContain("画面外の背景サーバー監視を停止");
    expect(announcements[2].body).toContain("BAN処理を修正");
  });
});
