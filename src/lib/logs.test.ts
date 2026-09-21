import { describe, expect, it } from "vitest";
import type { LogEntry } from "../types";
import { sameLogSnapshot } from "./logs";

const entry = (message: string): LogEntry => ({ timestamp: "12:00:00", level: "INFO", message });

describe("polled log snapshot comparison", () => {
  it("reuses an unchanged snapshot, including an empty one", () => {
    const snapshot = [entry("ready")];
    expect(sameLogSnapshot(snapshot, snapshot)).toBe(true);
    expect(sameLogSnapshot([], [])).toBe(true);
  });

  it("rejects appended or changed log entries", () => {
    expect(sameLogSnapshot([entry("ready")], [entry("ready"), entry("started")])).toBe(false);
    expect(sameLogSnapshot([entry("ready")], [entry("failed")])).toBe(false);
  });

  it("keeps the full comparison fallback when only an older entry changed", () => {
    expect(sameLogSnapshot([entry("old"), entry("ready")], [entry("changed"), entry("ready")])).toBe(false);
  });
});
