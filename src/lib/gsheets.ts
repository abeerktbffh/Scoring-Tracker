import { createSign } from "node:crypto";

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/** Build a signed RS256 JWT for the Google OAuth2 jwt-bearer grant. */
export function buildJwt(key: ServiceAccountKey, nowSec: number, scope: string = SCOPE): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email,
    scope,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  return `${signingInput}.${b64url(signer.sign(key.private_key))}`;
}

/** Exchange the service-account JWT for an OAuth access token. */
export async function getAccessToken(
  key: ServiceAccountKey,
  opts: { nowSec: number; fetchImpl?: typeof fetch },
): Promise<string> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildJwt(key, opts.nowSec),
    }),
  });
  if (!res.ok) throw new Error(`Google token request failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

/** Read a range from a spreadsheet. */
export async function getValues(
  token: string,
  sheetId: string,
  range: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<string[][]> {
  const f = opts?.fetchImpl ?? fetch;
  const url = `${BASE}/${sheetId}/values/${encodeURIComponent(range)}`;
  const res = await f(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets getValues failed: ${res.status}`);
  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

/** Overwrite a range (RAW). Write function — introduced in Phase 2a. */
export async function updateValues(
  token: string, sheetId: string, range: string, values: string[][],
  opts?: { fetchImpl?: typeof fetch },
): Promise<void> {
  const f = opts?.fetchImpl ?? fetch;
  const url = `${BASE}/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await f(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets updateValues failed: ${res.status}`);
}

/** Append rows to the end of a range (RAW, INSERT_ROWS). */
export async function appendValues(
  token: string, sheetId: string, range: string, values: string[][],
  opts?: { fetchImpl?: typeof fetch },
): Promise<void> {
  const f = opts?.fetchImpl ?? fetch;
  const url = `${BASE}/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await f(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets appendValues failed: ${res.status}`);
}
