import type { LogEntry } from "../types";

function sameLogEntry(left: LogEntry | undefined, right: LogEntry | undefined) {
  return left?.timestamp === right?.timestamp
    && left?.level === right?.level
    && left?.message === right?.message;
}

/**
 * Compare a polled log snapshot without scanning unchanged history first.
 * The full comparison remains as a correctness fallback when the tail is the same.
 */
export function sameLogSnapshot(left: readonly LogEntry[], right: readonly LogEntry[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  if (left.length === 0) return true;
  if (!sameLogEntry(left[left.length - 1], right[right.length - 1])) return false;
  return left.every((entry, index) => sameLogEntry(entry, right[index]));
}
