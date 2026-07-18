import type { BugItem } from "./sheetModel";
import { classifyItem } from "./classify";

const PRIO: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/** Build the human-facing daily triage summary (new items only). PURE. */
export function buildTriageSummary(
  items: BugItem[],
  ctx: { today: string; lastRunDate: string | null },
): string {
  const enriched = items
    .map((it) => ({ it, cls: classifyItem(it, { lastRunDate: ctx.lastRunDate }) }))
    .filter((e) => e.cls.isNew);
  const byPrio = (a: { it: BugItem }, b: { it: BugItem }) =>
    (PRIO[a.it.priority] ?? 9) - (PRIO[b.it.priority] ?? 9);
  const candidates = enriched.filter((e) => e.cls.autoBuildCandidate).sort(byPrio);
  const needsYou = enriched.filter((e) => !e.cls.autoBuildCandidate).sort(byPrio);

  const lines: string[] = [];
  lines.push(`# Bug automation — triage ${ctx.today}`);
  lines.push(`New since last run: ${enriched.length} (auto-build candidates: ${candidates.length}, needs you: ${needsYou.length})`);
  lines.push("");
  lines.push("## Auto-build candidates");
  lines.push(candidates.length
    ? candidates.map((e) => `- ${e.it.id} [${e.it.priority}] ${e.it.title} — ${e.it.description}`).join("\n")
    : "- (none)");
  lines.push("");
  lines.push("## Needs you (not auto-built)");
  lines.push(needsYou.length
    ? needsYou.map((e) => `- ${e.it.id} [${e.it.priority}] ${e.it.title} — ${e.cls.reasons.join("; ")}`).join("\n")
    : "- (none)");
  return lines.join("\n");
}
