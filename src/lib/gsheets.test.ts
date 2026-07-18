import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { buildJwt, getAccessToken, getValues } from "./gsheets";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KEY = { client_email: "bot@proj.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };

describe("buildJwt", () => {
  it("produces a verifiable RS256 JWT with the right claims", () => {
    const jwt = buildJwt(KEY, 1_000_000);
    const [h, p, s] = jwt.split(".");
    expect(h && p && s).toBeTruthy();
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    const claim = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(claim.iss).toBe(KEY.client_email);
    expect(claim.aud).toBe("https://oauth2.googleapis.com/token");
    expect(claim.scope).toContain("spreadsheets");
    expect(claim.exp - claim.iat).toBe(3600);
    const v = createVerify("RSA-SHA256"); v.update(`${h}.${p}`);
    expect(v.verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });
});

describe("getAccessToken", () => {
  it("POSTs the jwt-bearer grant and returns the access_token", async () => {
    let captured: any = null;
    const fetchImpl = (async (url: string, init: any) => {
      captured = { url, body: init.body.toString() };
      return { ok: true, json: async () => ({ access_token: "tok-123" }) };
    }) as unknown as typeof fetch;
    const tok = await getAccessToken(KEY, { nowSec: 1_000_000, fetchImpl });
    expect(tok).toBe("tok-123");
    expect(captured.url).toBe("https://oauth2.googleapis.com/token");
    expect(captured.body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
    expect(captured.body).toContain("assertion=");
  });
  it("throws on a non-ok token response", async () => {
    const fetchImpl = (async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(getAccessToken(KEY, { nowSec: 1, fetchImpl })).rejects.toThrow(/401/);
  });
});

describe("getValues", () => {
  it("GETs the range with a bearer token and returns values", async () => {
    let captured: any = null;
    const fetchImpl = (async (url: string, init: any) => {
      captured = { url, auth: init.headers.Authorization };
      return { ok: true, json: async () => ({ values: [["ID","Type"],["B001","Bug"]] }) };
    }) as unknown as typeof fetch;
    const vals = await getValues("tok-123", "SHEET", "Tracker!A1:K5", { fetchImpl });
    expect(vals).toEqual([["ID","Type"],["B001","Bug"]]);
    expect(captured.url).toContain("/spreadsheets/SHEET/values/");
    expect(captured.url).toContain("Tracker");
    expect(captured.auth).toBe("Bearer tok-123");
  });
  it("returns [] when the sheet range is empty (no values field)", async () => {
    const fetchImpl = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await getValues("t", "S", "R", { fetchImpl })).toEqual([]);
  });
});
