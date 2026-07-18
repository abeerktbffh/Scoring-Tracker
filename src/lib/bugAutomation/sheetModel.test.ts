import { describe, it, expect } from "vitest";
import { parseRows } from "./sheetModel";

const HEADER = ["ID","Type","Title","Description","Priority","Status","Reporter","Created","Due","Resolved","Notes"];

describe("parseRows", () => {
  it("maps rows to BugItem with correct 1-based sheet rowNumber", () => {
    const items = parseRows([
      HEADER,
      ["B001","Bug","Dropdown","not scrollable","High","Backlog","DJ","2026-07-13","2026-07-19","",""],
      ["M003","Improvement","New Games","add hindu mini","High","Done","DJ","2026-07-13","","2026-07-13","auto log note"],
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      id: "B001", type: "Bug", title: "Dropdown", description: "not scrollable",
      priority: "High", status: "Backlog", reporter: "DJ",
      created: "2026-07-13", due: "2026-07-19", resolved: "", notes: "", rowNumber: 2,
    });
    expect(items[1].rowNumber).toBe(3);
    expect(items[1].notes).toBe("auto log note");
  });
  it("skips rows with a blank ID and tolerates short/ragged rows", () => {
    const items = parseRows([HEADER, ["","","","","","","","","","",""], ["B002","Bug","T"]]);
    expect(items.map((i) => i.id)).toEqual(["B002"]);
    expect(items[0].description).toBe("");
    expect(items[0].rowNumber).toBe(3);
  });
  it("returns [] for empty input", () => {
    expect(parseRows([])).toEqual([]);
  });
});
