import { describe, expect, it } from "vitest";
import { BACKGROUND_STATUS_POLL_INTERVAL_MS, isServerWorkspaceVisible, selectedLogPollInterval, selectedStatusPollInterval, shouldPollBackgroundStatuses } from "./pollingPolicy";

describe("low-overhead polling policy", () => {
  it("keeps active controls responsive without polling a running server every second", () => {
    expect(selectedStatusPollInterval("running", "home")).toBe(2_000);
    expect(selectedStatusPollInterval("starting", "home")).toBe(1_000);
    expect(selectedStatusPollInterval("stopped", "home")).toBe(5_000);
  });

  it("backs off when browsing library pages and pauses hidden log views", () => {
    expect(isServerWorkspaceVisible("news")).toBe(false);
    expect(selectedStatusPollInterval("running", "news")).toBe(10_000);
    expect(selectedLogPollInterval("running", "news", "overview")).toBeUndefined();
    expect(selectedLogPollInterval("running", "home", "overview")).toBe(5_000);
    expect(selectedLogPollInterval("running", "home", "console")).toBe(2_000);
    expect(BACKGROUND_STATUS_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(15_000);
    expect(shouldPollBackgroundStatuses("news", 2)).toBe(false);
    expect(shouldPollBackgroundStatuses("home", 2)).toBe(true);
    expect(shouldPollBackgroundStatuses("home", 0)).toBe(false);
  });
});
