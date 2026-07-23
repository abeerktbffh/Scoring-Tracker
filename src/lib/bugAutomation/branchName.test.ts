import { describe, it, expect } from "vitest";
import { slugify, buildBranchName } from "./branchName";

describe("buildBranchName", () => {
  it("slugifies the title into a branch name", () => {
    expect(buildBranchName({ id: "B001", title: "Dropdown scrollability" })).toBe("auto/bug-b001-dropdown-scrollability");
  });
  it("strips punctuation and collapses separators", () => {
    expect(buildBranchName({ id: "B006", title: "Help/About doesn't work!" })).toBe("auto/bug-b006-help-about-doesn-t-work");
  });
  it("truncates a very long slug to 40 chars", () => {
    expect(slugify("a".repeat(80)).length).toBe(40);
  });
  it("falls back to id-only when the title has no slug chars", () => {
    expect(buildBranchName({ id: "B009", title: "!!!" })).toBe("auto/bug-b009");
  });
});
