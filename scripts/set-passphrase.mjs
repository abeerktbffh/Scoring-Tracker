import { neon } from "@neondatabase/serverless";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const sql = neon(process.env.DATABASE_URL);
const passphrase = process.argv[2];
if (!passphrase) {
  console.error("Usage: node scripts/set-passphrase.mjs <passphrase>");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
const key = (await scryptAsync(passphrase, salt, 64)).toString("hex");
await sql`UPDATE groups SET passphrase_hash = ${`${salt}:${key}`} WHERE id = 'g1'`;
console.log("Passphrase set for group g1.");
