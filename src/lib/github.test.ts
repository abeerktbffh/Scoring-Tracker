import { describe, it, expect } from "vitest";
import { openDraftPr } from "./github";

describe("openDraftPr", () => {
  it("POSTs a draft PR and returns html_url", async () => {
    let cap: any = null;
    const fetchImpl = (async (url: string, init: any) => {
      cap = { url, method: init.method, auth: init.headers.Authorization, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ html_url: "https://github.com/o/r/pull/12" }) };
    }) as unknown as typeof fetch;
    const url = await openDraftPr({ token: "T", repo: "o/r", head: "auto/bug-b001-x", base: "main", title: "fix", body: "b" }, { fetchImpl });
    expect(url).toBe("https://github.com/o/r/pull/12");
    expect(cap.url).toBe("https://api.github.com/repos/o/r/pulls");
    expect(cap.method).toBe("POST");
    expect(cap.auth).toBe("Bearer T");
    expect(cap.body).toMatchObject({ head: "auto/bug-b001-x", base: "main", title: "fix", draft: true });
  });
  it("throws on non-ok", async () => {
    const fetchImpl = (async () => ({ ok: false, status: 422, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(openDraftPr({ token: "T", repo: "o/r", head: "h", base: "main", title: "t", body: "b" }, { fetchImpl })).rejects.toThrow(/422/);
  });
});
