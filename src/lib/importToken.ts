import { randomBytes } from "node:crypto";
import { hashInviteToken } from "./inviteToken";

/** SHA-256 hex hash of an import token (reuses the invite-token hashing). */
export function hashImportToken(token: string): string {
  return hashInviteToken(token);
}

/**
 * Mint a new import token: a 144-bit random, url-safe (~24 char) token plus its
 * hash. The plaintext `token` is shown to the caller ONCE; only `tokenHash` is
 * ever stored.
 */
export function generateImportToken(): { token: string; tokenHash: string } {
  const token = randomBytes(18).toString("base64url");
  return { token, tokenHash: hashImportToken(token) };
}
