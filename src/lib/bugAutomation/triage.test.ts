import { describe, it, expect } from "vitest";
import { buildTriageSummary } from "./triage";
import type { BugItem } from "./sheetModel";

const mk = (o: Partial<BugItem>): BugItem => ({
  id: "X", type: "Bug", title: "t", description: "a sufficiently long description",
  priority: "High", status: "Backlog", reporter: "DJ",
  created: "2026-07-18", due: "", resolved: "", notes: "", rowNumber: 2, ...o,
});

describe("buildTriageSummary", () => {
  it("lists new candidates and needs-you separately, with counts", () => {
    const out = buildTriageSummary([
      mk({ id: "B001", priority: "Critical" }),
      mk({ id: "M001", type: "Improvement" }),
      mk({ id: "B009", created: "2026-07-01" }), // old → not new
    ], { today: "2026-07-18", lastRunDate: "2026-07-17" });
    expect(out).toContain("New since last run: 2");
    expect(out).toContain("B001");
    expect(out).toMatch(/Auto-build candidates[\s\S]*B001/);
    expect(out).toMatch(/Needs you[\s\S]*M001/);
    expect(out).not.toContain("B009");
  });
  it("shows '(none)' in an empty section", () => {
    const out = buildTriageSummary([mk({ id: "M001", type: "Improvement" })], { today: "2026-07-18", lastRunDate: null });
    expect(out).toMatch(/Auto-build candidates\n- \(none\)/);
  });
});
