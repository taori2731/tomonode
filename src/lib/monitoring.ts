import type { MonitoringSettings, RuntimeStatus, ServerProfile } from "../types";

export const monitoringKey = "server-hub:monitoring:v1";

export const defaultMonitoring: MonitoringSettings = {
  enabled: true,
  cpuWarningPercent: 85,
  memoryWarningPercent: 90,
  minimumTps: 18,
  notifyOnCrash: true,
};

export function clamp(value: number | undefined, minimum: number, maximum: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

export function readMonitoring(): MonitoringSettings {
  try {
    const value = JSON.parse(localStorage.getItem(monitoringKey) ?? "null") as Partial<MonitoringSettings> | null;
    return {
      enabled: value?.enabled ?? defaultMonitoring.enabled,
      cpuWarningPercent: clamp(value?.cpuWarningPercent, 50, 100, defaultMonitoring.cpuWarningPercent),
      memoryWarningPercent: clamp(value?.memoryWarningPercent, 50, 100, defaultMonitoring.memoryWarningPercent),
      minimumTps: clamp(value?.minimumTps, 5, 20, defaultMonitoring.minimumTps),
      notifyOnCrash: value?.notifyOnCrash ?? defaultMonitoring.notifyOnCrash,
    };
  } catch { return defaultMonitoring; }
}

export function statusFor(server: ServerProfile, statuses: Record<string, RuntimeStatus>): RuntimeStatus {
  return statuses[server.id] ?? {
    state: "stopped", playerCount: 0, maxPlayers: server.settings.maxPlayers, memoryUsedMib: 0,
    uptimeSeconds: 0, address: `localhost:${server.port}`, cpuPercent: 0, tps: null,
    tpsSupported: server.serverType === "paper" || server.serverType === "vanilla", pingLatencyMs: null,
  };
}

export function monitoringWarnings(servers: ServerProfile[], statuses: Record<string, RuntimeStatus>, settings: MonitoringSettings) {
  if (!settings.enabled) return [];
  return servers.flatMap((server) => {
    const status = statusFor(server, statuses);
    const values: string[] = [];
    const memoryPercent = server.maxMemoryMib > 0 ? status.memoryUsedMib / server.maxMemoryMib * 100 : 0;
    if (settings.notifyOnCrash && status.state === "crashed") values.push(`${server.name}: サーバーが異常終了しました`);
    if (status.state === "running" && status.cpuPercent >= settings.cpuWarningPercent) values.push(`${server.name}: Java CPU ${status.cpuPercent.toFixed(0)}%`);
    if (status.state === "running" && memoryPercent >= settings.memoryWarningPercent) values.push(`${server.name}: メモリ ${memoryPercent.toFixed(0)}%`);
    if (status.state === "running" && status.tps != null && status.tps < settings.minimumTps) values.push(`${server.name}: TPS ${status.tps.toFixed(1)}`);
    return values;
  });
}
