// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { saveName, loadName, clearName } from "./rememberMe";

beforeEach(() => {
  window.localStorage.clear();
});

describe("rememberMe", () => {
  it("round-trips a saved name through loadName", () => {
    saveName("Abeer");
    expect(loadName()).toBe("Abeer");
  });

  it("returns null from loadName when nothing has been saved", () => {
    expect(loadName()).toBeNull();
  });

  it("clearName removes a previously saved name", () => {
    saveName("Abeer");
    clearName();
    expect(loadName()).toBeNull();
  });
});
