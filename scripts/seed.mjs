import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

await sql`INSERT INTO groups (id, name, passphrase_hash)
  VALUES ('g1', 'Friends', 'REPLACE_ME')
  ON CONFLICT (id) DO NOTHING`;

await sql`INSERT INTO games (id, group_id, name, type, metric_direction, parser_id)
  VALUES ('wordle', 'g1', 'Wordle', 'outcome', 'lower_better', 'wordle')
  ON CONFLICT (id) DO NOTHING`;

console.log("Seed complete.");
