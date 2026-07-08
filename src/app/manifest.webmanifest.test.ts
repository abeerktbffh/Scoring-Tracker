import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("manifest share_target", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));

  it("declares a GET share target at /share-target", () => {
    expect(manifest.share_target).toBeDefined();
    expect(manifest.share_target.action).toBe("/share-target");
    expect(String(manifest.share_target.method).toUpperCase()).toBe("GET");
  });

  it("maps the shared text to the `text` query param", () => {
    expect(manifest.share_target.params.text).toBe("text");
  });

  it("keeps the existing app identity", () => {
    expect(manifest.name).toBe("Bragboard");
    expect(manifest.start_url).toBe("/");
  });
});
