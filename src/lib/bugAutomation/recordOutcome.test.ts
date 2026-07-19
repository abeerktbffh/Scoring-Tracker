import { describe, it, expect, vi } from "vitest";
import { recordOutcome } from "./recordOutcome";
import type { BugItem } from "./sheetModel";

const item: BugItem = { id: "B002", type: "Bug", title: "t", description: "d", priority: "Critical",
  status: "Backlog", reporter: "DJ", created: "2026-07-19", due: "", resolved: "", notes: "", rowNumber: 3 };

describe("recordOutcome", () => {
  it("dry-run applies no writes", async () => {
    const update = vi.fn(async () => {});
    await recordOutcome(item, { kind: "buildStarted" }, "2026-07-19", { dryRun: true, update, log: () => {} });
    expect(update).not.toHaveBeenCalled();
  });
  it("real run writes the planned Status cell", async () => {
    const update = vi.fn(async () => {});
    await recordOutcome(item, { kind: "buildStarted" }, "2026-07-19", { dryRun: false, update });
    expect(update).toHaveBeenCalledWith("Tracker!F3", [["In Progress"]]);
  });
  it("prOpened writes In Review + appends the PR url to Notes", async () => {
    const calls: any[] = [];
    const update = vi.fn(async (r: string, v: string[][]) => { calls.push([r, v]); });
    await recordOutcome(item, { kind: "prOpened", prUrl: "https://x/pr/1" }, "2026-07-19", { dryRun: false, update });
    expect(calls).toEqual([["Tracker!F3", [["In Review"]]], ["Tracker!K3", [["https://x/pr/1"]]]]);
  });
});
