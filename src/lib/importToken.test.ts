import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { generateImportToken, hashImportToken } from "./importToken";

describe("importToken", () => {
  it("hashImportToken is SHA-256 hex and deterministic", () => {
    const h = hashImportToken("abc");
    expect(h).toBe(createHash("sha256").update("abc").digest("hex"));
    expect(hashImportToken("abc")).toBe(h);
  });

  it("generateImportToken returns a url-safe token whose hash matches", () => {
    const { token, tokenHash } = generateImportToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/); // base64url, ~24 chars
    expect(tokenHash).toBe(hashImportToken(token));
  });

  it("generateImportToken is unique across calls", () => {
    expect(generateImportToken().token).not.toBe(generateImportToken().token);
  });
});
