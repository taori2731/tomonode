import type { PalworldRuntimeMetrics, RuntimeStatus } from "../types";

function sameStringArray(left: readonly string[] | undefined, right: readonly string[] | undefined) {
  const previous = left ?? [];
  const next = right ?? [];
  return previous.length === next.length && previous.every((value, index) => value === next[index]);
}

function samePalworldMetrics(left: PalworldRuntimeMetrics | null | undefined, right: PalworldRuntimeMetrics | null | undefined) {
  if (left == null || right == null) return left == null && right == null;
  if (left === right) return true;
  return left.apiReachable === right.apiReachable
    && left.version === right.version
    && left.serverName === right.serverName
    && left.worldGuid === right.worldGuid
    && left.serverFps === right.serverFps
    && left.serverFrameTimeMs === right.serverFrameTimeMs
    && left.baseCampCount === right.baseCampCount
    && left.worldDays === right.worldDays
    && left.players.length === right.players.length
    && left.players.every((player, index) => {
      const other = right.players[index];
      return player.name === other?.name
        && player.accountName === other?.accountName
        && player.playerId === other?.playerId
        && player.userId === other?.userId
        && player.ping === other?.ping
        && player.level === other?.level
        && player.buildingCount === other?.buildingCount;
    });
}

export function sameRuntimeStatus(left?: RuntimeStatus, right?: RuntimeStatus) {
  return Boolean(left && right)
    && left?.state === right?.state
    && left?.playerCount === right?.playerCount
    && left?.maxPlayers === right?.maxPlayers
    && sameStringArray(left?.onlinePlayers, right?.onlinePlayers)
    && left?.memoryUsedMib === right?.memoryUsedMib
    && left?.uptimeSeconds === right?.uptimeSeconds
    && left?.address === right?.address
    && left?.cpuPercent === right?.cpuPercent
    && left?.tps === right?.tps
    && left?.tpsSupported === right?.tpsSupported
    && left?.pingLatencyMs === right?.pingLatencyMs
    && samePalworldMetrics(left?.palworld, right?.palworld);
}
