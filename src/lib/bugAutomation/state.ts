import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export interface RunState {
  lastRunDate: string | null;
  lastRunAt: string | null;
}

const EMPTY: RunState = { lastRunDate: null, lastRunAt: null };

export function readState(path: string): RunState {
  if (!existsSync(path)) return { ...EMPTY };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return { lastRunDate: parsed.lastRunDate ?? null, lastRunAt: parsed.lastRunAt ?? null };
  } catch {
    return { ...EMPTY };
  }
}

export function writeState(path: string, state: RunState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}

/** True unless the automation already ran today (drives the once-a-day guard). */
export function shouldRunToday(state: RunState, today: string): boolean {
  return state.lastRunDate !== today;
}
