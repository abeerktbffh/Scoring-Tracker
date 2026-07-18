import type { BugItem } from "./sheetModel";

export interface Classification {
  isNew: boolean;
  autoBuildCandidate: boolean;
  reasons: string[];
}

/** Minimum description length to even attempt an auto-build (below = too vague). */
const MIN_DESC = 15;

/**
 * Classify an item for the daily run. `autoBuildCandidate` reflects only the
 * CHEAP gates checkable from the row; the deeper evidence gates
 * (reproduce/locate, bounded, low-risk, not-already-handled) are applied at
 * build time in Phase 2 and can still stop a candidate.
 */
export function classifyItem(item: BugItem, ctx: { lastRunDate: string | null }): Classification {
  const isNew = ctx.lastRunDate === null || (item.created !== "" && item.created >= ctx.lastRunDate);
  const reasons: string[] = [];
  if (item.status !== "Backlog") reasons.push(`status is "${item.status}", not Backlog`);
  if (item.type !== "Bug") reasons.push(`type is "${item.type}" (only Bugs auto-build)`);
  if (item.priority !== "Critical" && item.priority !== "High") reasons.push(`priority is "${item.priority}" (need Critical/High)`);
  if (item.description.length < MIN_DESC) reasons.push("description too short to act on");
  const autoBuildCandidate = reasons.length === 0;
  if (autoBuildCandidate) {
    reasons.push("clears the cheap bar; deeper gates (reproduce/locate, bounded, low-risk) applied at build time");
  }
  return { isNew, autoBuildCandidate, reasons };
}
