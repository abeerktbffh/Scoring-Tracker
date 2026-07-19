import { describe, it, expect, vi } from "vitest";
import { applyWrites, formatRunLogRow } from "./applyWrites";

describe("applyWrites", () => {
  it("dry-run logs and applies NOTHING", async () => {
    const update = vi.fn(async () => {});
    const logs: string[] = [];
    await applyWrites([{ range: "Tracker!F8", value: "In Review" }], { dryRun: true, update, log: (m) => logs.push(m) });
    expect(update).not.toHaveBeenCalled();
    expect(logs.join("\n")).toMatch(/Tracker!F8.*In Review/);
  });
  it("real run calls update(range, [[value]]) per write", async () => {
    const update = vi.fn(async () => {});
    await applyWrites(
      [{ range: "Tracker!F8", value: "In Review" }, { range: "Tracker!K8", value: "note" }],
      { dryRun: false, update },
    );
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, "Tracker!F8", [["In Review"]]);
    expect(update).toHaveBeenNthCalledWith(2, "Tracker!K8", [["note"]]);
  });
});

describe("formatRunLogRow", () => {
  it("formats a one-row summary", () => {
    expect(formatRunLogRow("2026-07-19", { candidates: 3, built: 1, questions: 1, blocked: 1 }))
      .toEqual([["2026-07-19", "candidates:3", "built:1", "questions:1", "blocked:1"]]);
  });
});
