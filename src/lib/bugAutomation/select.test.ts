import { describe, it, expect } from "vitest";
import { selectBuildCandidates } from "./select";
import type { BugItem } from "./sheetModel";

const mk = (o: Partial<BugItem>): BugItem => ({
  id: "X", type: "Bug", title: "t", description: "a long enough description here",
  priority: "High", status: "Backlog", reporter: "DJ", created: "2026-07-19",
  due: "", resolved: "", notes: "", rowNumber: 2, ...o,
});

describe("selectBuildCandidates", () => {
  it("returns only new auto-build candidates, Critical before High, capped", () => {
    const items = [
      mk({ id: "H1", priority: "High" }),
      mk({ id: "C1", priority: "Critical" }),
      mk({ id: "M1", type: "Improvement" }),        // not a bug → excluded
      mk({ id: "L1", priority: "Low" }),             // low → excluded
      mk({ id: "H2", priority: "High" }),
      mk({ id: "OLD", priority: "Critical", created: "2026-01-01" }), // not new
    ];
    const out = selectBuildCandidates(items, { lastRunDate: "2026-07-18" }, 3);
    expect(out.map((i) => i.id)).toEqual(["C1", "H1", "H2"]);
  });
  it("defaults the cap to 3", () => {
    const many = Array.from({ length: 5 }, (_, i) => mk({ id: `C${i}`, priority: "Critical" }));
    expect(selectBuildCandidates(many, { lastRunDate: null }).length).toBe(3);
  });
});
