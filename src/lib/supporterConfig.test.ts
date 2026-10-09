import { describe, expect, it } from "vitest";
import { formatSupportMonthlyAmount, supportConfig } from "./supporterConfig";

describe("Stripe support configuration", () => {
  it("enables server-gated billing integration at USD 3/month plus tax", () => {
    expect(supportConfig.enabled).toBe(true);
    expect(supportConfig.provider).toBe("stripe");
    expect(supportConfig.monthlyAmount).toBe(3);
    expect(supportConfig.currency).toBe("USD");
    expect(supportConfig.taxBehavior).toBe("exclusive");
  });

  it("formats the same planned amount for different locales", () => {
    expect(formatSupportMonthlyAmount("ja")).toBe("$3");
    expect(formatSupportMonthlyAmount("en")).toBe("$3");
  });
});
