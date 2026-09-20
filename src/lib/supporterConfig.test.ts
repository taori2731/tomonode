import { describe, expect, it } from "vitest";
import { GITHUB_SPONSORS_SETUP_URL, GITHUB_SPONSORS_URL, isSupportExternalUrl, supportConfig, supportExternalUrls } from "./supporterConfig";

describe("GitHub Sponsors support configuration", () => {
  it("starts disabled until recipient setup is complete", () => {
    expect(supportConfig.enabled).toBe(false);
    expect(supportConfig.sponsorUrl).toBe(GITHUB_SPONSORS_URL);
    expect(supportConfig.setupUrl).toBe(GITHUB_SPONSORS_SETUP_URL);
  });

  it("keeps support destinations on the fixed HTTPS allowlist", () => {
    expect(supportExternalUrls).toEqual([GITHUB_SPONSORS_URL, GITHUB_SPONSORS_SETUP_URL]);
    expect(isSupportExternalUrl(GITHUB_SPONSORS_URL)).toBe(true);
    expect(isSupportExternalUrl(GITHUB_SPONSORS_SETUP_URL)).toBe(true);
    expect(isSupportExternalUrl("https://example.com/")).toBe(false);
    expect(isSupportExternalUrl("javascript:alert(1)")).toBe(false);
  });
});
