import type { AppSection, ServerState, TabId } from "../types";

export const BACKGROUND_STATUS_POLL_INTERVAL_MS = 15_000;

export function isServerWorkspaceVisible(section: AppSection) {
  return section === "home" || section === "players";
}

export function selectedStatusPollInterval(state: ServerState, section: AppSection) {
  if (!isServerWorkspaceVisible(section)) return 10_000;
  if (state === "starting" || state === "stopping" || state === "restarting") return 1_000;
  if (state === "running") return 2_000;
  return 5_000;
}

export function selectedLogPollInterval(state: ServerState, section: AppSection, tab: TabId) {
  if (state !== "running" || !isServerWorkspaceVisible(section)) return undefined;
  if (tab === "console") return 2_000;
  if (tab === "overview") return 5_000;
  return undefined;
}
