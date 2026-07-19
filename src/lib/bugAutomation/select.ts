import type { BugItem } from "./sheetModel";
import { classifyItem } from "./classify";

const PRIO: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/** New auto-build candidates, highest priority first, capped at `max` (default 3). */
export function selectBuildCandidates(
  items: BugItem[],
  ctx: { lastRunDate: string | null },
  max = 3,
): BugItem[] {
  return items
    .map((it) => ({ it, c: classifyItem(it, ctx) }))
    .filter((e) => e.c.isNew && e.c.autoBuildCandidate)
    .sort((a, b) => (PRIO[a.it.priority] ?? 9) - (PRIO[b.it.priority] ?? 9))
    .slice(0, max)
    .map((e) => e.it);
}
