import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const schema = readFileSync(new URL("../src/db/schema.sql", import.meta.url), "utf8");

// The neon() HTTP driver has no .query() method in this version; calling the
// sql function directly with a statement string runs one statement per request.
for (const statement of schema.split(";").map((s) => s.trim()).filter(Boolean)) {
  await sql(statement);
}
console.log("Migration complete.");
