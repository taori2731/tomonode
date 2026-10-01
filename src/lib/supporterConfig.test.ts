import { describe, expect, it } from "vitest";
import { formatSupportMonthlyAmount, supportConfig } from "./supporterConfig";

describe("Stripe support configuration", () => {
  it("keeps enrollment disabled while preparing the JPY 500 monthly plan", () => {
    expect(supportConfig.enabled).toBe(false);
    expect(supportConfig.provider).toBe("stripe");
    expect(supportConfig.monthlyAmount).toBe(500);
    expect(supportConfig.currency).toBe("JPY");
  });

  it("formats the same planned amount for different locales", () => {
    expect(formatSupportMonthlyAmount("ja")).toBe("￥500");
    expect(formatSupportMonthlyAmount("en")).toBe("¥500");
  });
});
