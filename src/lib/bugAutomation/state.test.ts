import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readState, writeState, shouldRunToday } from "./state";

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "bugstate-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe("run state", () => {
  it("returns empty state when the file is missing", () => {
    expect(readState(join(tmp(), "nope.json"))).toEqual({ lastRunDate: null, lastRunAt: null });
  });
  it("round-trips through write/read, creating parent dirs", () => {
    const p = join(tmp(), "nested", "state.json");
    writeState(p, { lastRunDate: "2026-07-18", lastRunAt: "2026-07-18T01:30:00Z" });
    expect(readState(p)).toEqual({ lastRunDate: "2026-07-18", lastRunAt: "2026-07-18T01:30:00Z" });
  });
  it("shouldRunToday is false only when lastRunDate equals today", () => {
    expect(shouldRunToday({ lastRunDate: "2026-07-18", lastRunAt: null }, "2026-07-18")).toBe(false);
    expect(shouldRunToday({ lastRunDate: "2026-07-17", lastRunAt: null }, "2026-07-18")).toBe(true);
    expect(shouldRunToday({ lastRunDate: null, lastRunAt: null }, "2026-07-18")).toBe(true);
  });
});
