import { scrypt, randomBytes, timingSafeEqual, ScryptOptions } from "node:crypto";
import { promisify } from "node:util";
const scryptAsync = promisify(scrypt) as (password: string | Buffer, salt: string | Buffer, keylen: number, options: ScryptOptions) => Promise<Buffer>;
const N = 32768, r = 8, p = 1, KEYLEN = 64;
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const dk = await scryptAsync(pw, salt, KEYLEN, { N, r, p, maxmem: 128 * N * r * 2 });
  return `scrypt$${N}$${r}$${p}$${salt}$${dk.toString("hex")}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, ns, rs, ps, salt, hashHex] = parts;
  const nN = Number(ns), nr = Number(rs), np = Number(ps);
  if (!nN || !nr || !np || !salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const dk = await scryptAsync(pw, salt, expected.length, { N: nN, r: nr, p: np, maxmem: 128 * nN * nr * 2 });
  return expected.length === dk.length && timingSafeEqual(expected, dk);
}
