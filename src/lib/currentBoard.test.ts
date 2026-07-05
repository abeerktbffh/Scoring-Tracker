// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { loadBoardId, saveBoardId } from "./currentBoard";

beforeEach(() => localStorage.clear());

describe("currentBoard", () => {
  it("defaults to null (Global)", () => {
    expect(loadBoardId()).toBeNull();
  });

  it("round-trips a group id", () => {
    saveBoardId("grp_1");
    expect(loadBoardId()).toBe("grp_1");
  });

  it("saving null clears it", () => {
    saveBoardId("grp_1");
    saveBoardId(null);
    expect(loadBoardId()).toBeNull();
  });
});
