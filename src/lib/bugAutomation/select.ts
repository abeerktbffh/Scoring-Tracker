import type { BugItem } from "./sheetModel";
import { classifyItem } from "./classify";

const PRIO: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/**
 * Eligible auto-build candidates (Backlog Bug + Critical/High), highest
 * priority first, capped at `max` (default 3). NOT filtered by recency: the
 * automation works the actual backlog, and the status lifecycle (an acted-on
 * item leaves Backlog → In Progress/In Review/Blocked) is what prevents
 * rebuilding, so old-but-still-Backlog bugs are valid candidates. `ctx` is
 * retained for signature stability (classifyItem also computes `isNew`, which
 * the daily triage uses; build selection ignores it).
 */
export function selectBuildCandidates(
  items: BugItem[],
  ctx: { lastRunDate: string | null },
  max = 3,
): BugItem[] {
  return items
    .map((it) => ({ it, c: classifyItem(it, ctx) }))
    .filter((e) => e.c.autoBuildCandidate)
    .sort((a, b) => (PRIO[a.it.priority] ?? 9) - (PRIO[b.it.priority] ?? 9))
    .slice(0, max)
    .map((e) => e.it);
}
