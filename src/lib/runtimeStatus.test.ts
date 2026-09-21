import { describe, expect, it } from "vitest";
import type { RuntimeStatus } from "../types";
import { sameRuntimeStatus } from "./runtimeStatus";

const status: RuntimeStatus = {
  state: "running",
  playerCount: 1,
  maxPlayers: 20,
  onlinePlayers: ["Player"],
  memoryUsedMib: 1024,
  uptimeSeconds: 10,
  address: "localhost:25565",
  cpuPercent: 5,
  tps: 20,
  tpsSupported: true,
  pingLatencyMs: 2,
  palworld: {
    apiReachable: true,
    version: "0.6.5.0",
    serverName: "Friends",
    worldGuid: "world",
    serverFps: 60,
    serverFrameTimeMs: 16.7,
    baseCampCount: 1,
    worldDays: 2,
    players: [{ name: "Pal", accountName: "Account", playerId: "player", userId: "user", ping: 20, level: 5, buildingCount: 1 }],
  },
};

describe("runtime status comparison", () => {
  it("treats equivalent snapshots as equal without serializing them", () => {
    expect(sameRuntimeStatus(status, structuredClone(status))).toBe(true);
  });

  it("detects scalar and nested player changes", () => {
    expect(sameRuntimeStatus(status, { ...status, cpuPercent: 6 })).toBe(false);
    expect(sameRuntimeStatus(status, { ...status, palworld: { ...status.palworld!, players: [{ ...status.palworld!.players[0], level: 6 }] } })).toBe(false);
  });

  it("keeps missing and empty online-player lists equivalent", () => {
    expect(sameRuntimeStatus({ ...status, onlinePlayers: undefined }, { ...status, onlinePlayers: [] })).toBe(true);
  });
});
