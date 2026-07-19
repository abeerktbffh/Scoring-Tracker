import { describe, it, expect } from "vitest";
import { classifyItem } from "./classify";
import type { BugItem } from "./sheetModel";

const base: BugItem = {
  id: "B001", type: "Bug", title: "t", description: "a clear enough description here",
  priority: "Critical", status: "Backlog", reporter: "DJ",
  created: "2026-07-18", due: "", resolved: "", notes: "", rowNumber: 2,
};

describe("classifyItem — isNew", () => {
  it("is new when there is no prior run", () => {
    expect(classifyItem(base, { lastRunDate: null }).isNew).toBe(true);
  });
  it("is new when created on/after last run, not before", () => {
    expect(classifyItem({ ...base, created: "2026-07-18" }, { lastRunDate: "2026-07-17" }).isNew).toBe(true);
    expect(classifyItem({ ...base, created: "2026-07-16" }, { lastRunDate: "2026-07-17" }).isNew).toBe(false);
  });
  it("is not new when created is empty and there is a prior run", () => {
    expect(classifyItem({ ...base, created: "" }, { lastRunDate: "2026-07-17" }).isNew).toBe(false);
  });
  it("is surfaced as new when created is non-ISO, even if it lexicographically looks earlier than last run", () => {
    // "1/13/2026" starts with "1", which sorts BEFORE "2026-07-17" as a plain string,
    // so a naive lexicographic compare would silently mark this as not-new. Since we
    // can't trust a non-ISO format's ordering, it must be surfaced instead of hidden.
    expect(classifyItem({ ...base, created: "1/13/2026" }, { lastRunDate: "2026-07-17" }).isNew).toBe(true);
  });
});

describe("classifyItem — guardrail bar (cheap gates)", () => {
  it("Critical/High Backlog Bug with a real description is a candidate", () => {
    const c = classifyItem(base, { lastRunDate: null });
    expect(c.autoBuildCandidate).toBe(true);
  });
  it("rejects non-Bug types", () => {
    const c = classifyItem({ ...base, type: "Improvement" }, { lastRunDate: null });
    expect(c.autoBuildCandidate).toBe(false);
    expect(c.reasons.join(" ")).toMatch(/only Bugs/i);
  });
  it("rejects Medium/Low priority", () => {
    expect(classifyItem({ ...base, priority: "Medium" }, { lastRunDate: null }).autoBuildCandidate).toBe(false);
  });
  it("rejects non-Backlog status", () => {
    expect(classifyItem({ ...base, status: "In Review" }, { lastRunDate: null }).autoBuildCandidate).toBe(false);
  });
  it("rejects too-short descriptions", () => {
    const c = classifyItem({ ...base, description: "broken" }, { lastRunDate: null });
    expect(c.autoBuildCandidate).toBe(false);
    expect(c.reasons.join(" ")).toMatch(/too short/i);
  });
  it("a candidate's reasons note that deeper gates apply at build time", () => {
    expect(classifyItem(base, { lastRunDate: null }).reasons.join(" ")).toMatch(/reproduce|build time/i);
  });
});
