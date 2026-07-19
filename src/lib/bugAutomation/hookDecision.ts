import type { RunState } from "./state";
import { shouldRunToday } from "./state";

/** Decide whether the daily SessionStart hook should fire. Pure. */
export function decideHook(input: { state: RunState; today: string; hasKey: boolean }): { fire: boolean; reason: string } {
  if (!input.hasKey) return { fire: false, reason: "no-key" };
  if (!shouldRunToday(input.state, input.today)) return { fire: false, reason: "already-ran-today" };
  return { fire: true, reason: "due" };
}
