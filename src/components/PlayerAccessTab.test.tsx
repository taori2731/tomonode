import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backend } from "../lib/backend";
import type { RuntimeStatus, ServerProfile } from "../types";
import { onlinePlayerAccessInput, PlayerAccessTab } from "./FilesPlayersTab";

const status: RuntimeStatus = {
  state: "running",
  playerCount: 1,
  maxPlayers: 20,
  onlinePlayers: ["rafaelInaca27"],
  memoryUsedMib: 1024,
  uptimeSeconds: 60,
  address: "127.0.0.1:25565",
  cpuPercent: 0,
  tps: 20,
  tpsSupported: true,
  pingLatencyMs: 10,
};

const server = { id: "forge-test", name: "Forge Test", serverType: "forge" } as ServerProfile;

afterEach(() => vi.restoreAllMocks());

describe("online player access actions", () => {
  it("sends a Java BAN as an addition, so the server receives ban instead of pardon", async () => {
    vi.spyOn(backend, "playerAccess").mockResolvedValue([]);
    vi.spyOn(backend, "listFixedPlayers").mockResolvedValue([]);
    vi.spyOn(backend, "playerSkin").mockResolvedValue(null);
    const update = vi.spyOn(backend, "updatePlayerAccess").mockResolvedValue();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<PlayerAccessTab server={server} status={status} notify={vi.fn()} fail={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /^BAN$/ }));

    await waitFor(() => expect(update).toHaveBeenCalledWith({
      serverId: "forge-test",
      kind: "banned_players",
      target: "rafaelInaca27",
      add: true,
      reason: "Banned from the online player list.",
    }));
  });

  it("keeps Bedrock's online-player action as allowlist removal", () => {
    expect(onlinePlayerAccessInput("bedrock-test", "XboxFriend", "ban", true)).toEqual({
      serverId: "bedrock-test",
      kind: "whitelist",
      target: "XboxFriend",
      add: false,
      reason: undefined,
    });

    const bedrockServer = { ...server, id: "bedrock-test", serverType: "bedrock" } as ServerProfile;
    vi.spyOn(backend, "playerAccess").mockResolvedValue([]);
    vi.spyOn(backend, "listFixedPlayers").mockResolvedValue([]);
    vi.spyOn(backend, "playerSkin").mockResolvedValue(null);
    const update = vi.spyOn(backend, "updatePlayerAccess").mockResolvedValue();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<PlayerAccessTab server={bedrockServer} status={status} notify={vi.fn()} fail={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^許可から外す$/ }));

    return waitFor(() => expect(update).toHaveBeenCalledWith({
      serverId: "bedrock-test",
      kind: "whitelist",
      target: "rafaelInaca27",
      add: false,
      reason: undefined,
    }));
  });
});
