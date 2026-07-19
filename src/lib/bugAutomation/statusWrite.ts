import type { BugItem } from "./sheetModel";

export type Outcome =
  | { kind: "buildStarted" }
  | { kind: "prOpened"; prUrl: string }
  | { kind: "question"; text: string }
  | { kind: "blocked"; text: string };

export interface CellWrite {
  range: string;
  value: string;
}

/**
 * The exact Status (col F) / Notes (col K) cell writes for an outcome.
 * Notes are appended to (existing content preserved). NEVER emits Status
 * "Done" and NEVER writes the Resolved column — those are owner-only.
 */
export function planStatusWrite(item: BugItem, outcome: Outcome, today: string): CellWrite[] {
  const F = `Tracker!F${item.rowNumber}`;
  const K = `Tracker!K${item.rowNumber}`;
  const appendNote = (tag: string): string => (item.notes ? `${item.notes}\n${tag}` : tag);
  switch (outcome.kind) {
    case "buildStarted":
      return [{ range: F, value: "In Progress" }];
    case "prOpened":
      return [{ range: F, value: "In Review" }, { range: K, value: appendNote(outcome.prUrl) }];
    case "question":
      return [{ range: F, value: "Blocked" }, { range: K, value: appendNote(`[auto-question ${today}] ${outcome.text}`) }];
    case "blocked":
      return [{ range: F, value: "Blocked" }, { range: K, value: appendNote(`[auto-blocked ${today}] ${outcome.text}`) }];
  }
}
