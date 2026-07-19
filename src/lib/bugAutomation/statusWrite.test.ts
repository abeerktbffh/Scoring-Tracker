import { describe, it, expect } from "vitest";
import { planStatusWrite } from "./statusWrite";
import type { BugItem } from "./sheetModel";

const item = (o: Partial<BugItem> = {}): BugItem => ({
  id: "B007", type: "Bug", title: "t", description: "d", priority: "High",
  status: "Backlog", reporter: "DJ", created: "2026-07-19", due: "", resolved: "",
  notes: "", rowNumber: 8, ...o,
});

describe("planStatusWrite", () => {
  it("buildStarted → Status In Progress only", () => {
    expect(planStatusWrite(item(), { kind: "buildStarted" }, "2026-07-19"))
      .toEqual([{ range: "Tracker!F8", value: "In Progress" }]);
  });
  it("prOpened → Status In Review + PR link appended to Notes", () => {
    expect(planStatusWrite(item({ notes: "old note" }), { kind: "prOpened", prUrl: "https://x/pr/9" }, "2026-07-19"))
      .toEqual([
        { range: "Tracker!F8", value: "In Review" },
        { range: "Tracker!K8", value: "old note\nhttps://x/pr/9" },
      ]);
  });
  it("question → Status Blocked + [auto-question] note (empty notes → no leading newline)", () => {
    expect(planStatusWrite(item(), { kind: "question", text: "which dropdown?" }, "2026-07-19"))
      .toEqual([
        { range: "Tracker!F8", value: "Blocked" },
        { range: "Tracker!K8", value: "[auto-question 2026-07-19] which dropdown?" },
      ]);
  });
  it("blocked → Status Blocked + [auto-blocked] note", () => {
    expect(planStatusWrite(item({ notes: "n" }), { kind: "blocked", text: "tests won't pass" }, "2026-07-19"))
      .toEqual([
        { range: "Tracker!F8", value: "Blocked" },
        { range: "Tracker!K8", value: "n\n[auto-blocked 2026-07-19] tests won't pass" },
      ]);
  });
});
