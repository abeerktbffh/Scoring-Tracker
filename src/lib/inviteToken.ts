import { randomBytes, createHash } from "node:crypto";
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(18).toString("base64url"); // ~24 url-safe chars
  return { token, tokenHash: hashInviteToken(token) };
}
