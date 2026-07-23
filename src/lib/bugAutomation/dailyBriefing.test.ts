import { describe, it, expect } from "vitest";
import { formatDailyBriefing, formatRunLogCandidates } from "./dailyBriefing";

describe("formatDailyBriefing", () => {
  const cands = [
    { id: "B002", priority: "Critical", title: "Pending games visibility" },
    { id: "B001", priority: "High", title: "Dropdown scrollability" },
  ];
  it("lists candidates with the build cue for the top one", () => {
    const out = formatDailyBriefing(cands, "2026-07-23");
    expect(out).toContain("🐛 Daily bug check (2026-07-23)");
    expect(out).toContain("2 ready to build");
    expect(out).toContain("B002 [Critical] Pending games visibility");
    expect(out).toContain("B001 [High] Dropdown scrollability");
    expect(out).toContain('Say "build B002"'); // cue names the top candidate's id
  });
  it("says so when there are no candidates", () => {
    expect(formatDailyBriefing([], "2026-07-23")).toBe("🐛 Daily bug check (2026-07-23): no new build candidates.");
  });
});

describe("formatRunLogCandidates", () => {
  it("emits one row with the candidate ids", () => {
    expect(formatRunLogCandidates("2026-07-23", [{ id: "B002" }, { id: "B001" }]))
      .toEqual([["2026-07-23", "notify", "candidates:2", "B002,B001", ""]]);
  });
  it("uses '-' and candidates:0 when empty", () => {
    expect(formatRunLogCandidates("2026-07-23", []))
      .toEqual([["2026-07-23", "notify", "candidates:0", "-", ""]]);
  });
});
