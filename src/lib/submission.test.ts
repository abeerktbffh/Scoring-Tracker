import { describe, it, expect } from "vitest";
import { resolveSubmission } from "./submission";

describe("resolveSubmission", () => {
  it("paste mode: parses recognized share text", () => {
    const r = resolveSubmission({ rawInput: "Wordle 1,838 3/6" });
    expect(r).toEqual({
      gameId: "wordle", puzzleNumber: 1838, variant: null,
      value: 3, solved: true, rawInput: "Wordle 1,838 3/6",
      detail: { guesses: 3, solved: true, hardMode: false, grid: [] },
    });
  });
  it("paste mode: 422 when unparseable", () => {
    expect(resolveSubmission({ rawInput: "unrecognizable text" })).toEqual({
      error: "Could not parse result", status: 422,
    });
  });
  it("manual mode: accepts explicit fields", () => {
    const r = resolveSubmission({ gameId: "nyt-mini", variant: null, value: 42, solved: true });
    expect(r).toEqual({
      gameId: "nyt-mini", variant: null, value: 42, solved: true,
      puzzleNumber: null, rawInput: null,
    });
  });
  it("manual mode: normalizes empty variant to null", () => {
    const r = resolveSubmission({ gameId: "pips", variant: "", value: 90, solved: true });
    expect((r as any).variant).toBeNull();
  });
  it("400 when neither paste nor a valid manual payload is present", () => {
    expect(resolveSubmission({})).toEqual({ error: "Missing or invalid fields", status: 400 });
    expect(resolveSubmission({ gameId: "x", value: "notnum", solved: true }))
      .toEqual({ error: "Missing or invalid fields", status: 400 });
  });
  it("uses an injected detector (no registry dependency in the test)", () => {
    const fake = () => ({ gameId: "g", puzzleNumber: 1, variant: null, value: 5, solved: true });
    const r = resolveSubmission({ rawInput: "anything" }, fake);
    expect((r as any).gameId).toBe("g");
  });
});
