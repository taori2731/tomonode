import { describe, expect, it } from "vitest";
import type { AppLocale } from "./i18n";
import { accountText } from "./accountLocale";

const locales: AppLocale[] = ["en", "ja", "zh-CN", "zh-TW", "ko", "es", "de", "fr", "pt-BR"];

describe("account password locale copy", () => {
  it.each(locales)("communicates the six-character minimum and byte limit in %s", (locale) => {
    const copy = accountText(locale);
    expect(copy.passwordHint).toMatch(/6.*128/);
    expect(copy.passwordInvalid).toMatch(/6.*128/);
    expect(copy.passwordInvalid).toContain("512");
  });
});
