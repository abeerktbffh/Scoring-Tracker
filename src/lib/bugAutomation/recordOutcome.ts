import type { BugItem } from "./sheetModel";
import { planStatusWrite, type Outcome } from "./statusWrite";
import { applyWrites } from "./applyWrites";

/**
 * The single seam for writing a build outcome back to the sheet: plan the
 * Status/Notes cell writes and push them through the dry-run-gated applyWrites.
 */
export async function recordOutcome(
  item: BugItem,
  outcome: Outcome,
  today: string,
  opts: { dryRun: boolean; update: (range: string, values: string[][]) => Promise<void>; log?: (m: string) => void },
): Promise<void> {
  await applyWrites(planStatusWrite(item, outcome, today), opts);
}
