// One-time: add the Hindu Mini + Easy Down games to the global catalog.
// Idempotent (ON CONFLICT DO NOTHING). Touches only the games table.
// Run at the gated deploy:  set -a && . ./.env.local && set +a && npx tsx scripts/add-hindu-games.mjs
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
// [id, name, type, metric_direction, parser_id, has_variants]
const games = [
  ["hindu-mini", "Hindu Mini", "timed", "lower_better", "hindu-mini", false],
  ["easy-down", "Easy Down", "timed", "lower_better", "easy-down", false],
];
for (const [id, name, type, dir, parserId, hasVariants] of games) {
  await sql`INSERT INTO games (id, name, type, metric_direction, parser_id, has_variants, active)
    VALUES (${id}, ${name}, ${type}, ${dir}, ${parserId}, ${hasVariants}, true)
    ON CONFLICT (id) DO NOTHING`;
}
const rows = await sql`SELECT id, name, active FROM games WHERE id IN ('hindu-mini','easy-down') ORDER BY id`;
console.log("games present:", JSON.stringify(rows));
