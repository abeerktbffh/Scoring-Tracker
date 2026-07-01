import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(secret, salt, KEYLEN)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [salt, keyHex] = stored.split(":");
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, "hex");
  const derived = (await scryptAsync(secret, salt, KEYLEN)) as Buffer;
  return keyBuf.length === derived.length && timingSafeEqual(keyBuf, derived);
}
