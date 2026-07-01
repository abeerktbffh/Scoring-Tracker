import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

await sql`INSERT INTO groups (id, name, passphrase_hash)
  VALUES ('g1', 'Friends', 'REPLACE_ME')
  ON CONFLICT (id) DO NOTHING`;

// [id, name, type, metric_direction, parser_id|null, has_variants]
const games = [
  ["wordle", "Wordle", "outcome", "lower_better", "wordle", false],
  ["pips", "Pips", "timed", "lower_better", "pips", true],
  ["connections", "Connections", "outcome", "lower_better", "connections", false],
  ["minute-cryptic", "Minute Cryptic", "outcome", "lower_better", "minute-cryptic", false],
  ["queens", "Queens", "timed", "lower_better", "queens", false],
  ["tango", "Tango", "timed", "lower_better", "tango", false],
  ["mini-sudoku", "Mini Sudoku", "timed", "lower_better", "mini-sudoku", false],
  // Manual-only for now (no parser yet) — still fully loggable via manual entry.
  ["strands", "Strands", "outcome", "lower_better", null, false],
  ["nyt-mini", "NYT Mini", "timed", "lower_better", null, false],
  ["zip", "Zip", "timed", "lower_better", null, false],
  ["crossclimb", "Crossclimb", "timed", "lower_better", null, false],
  ["pinpoint", "Pinpoint", "outcome", "lower_better", null, false],
  ["patches", "Patches", "timed", "lower_better", null, false],
];

for (const [id, name, type, dir, parserId, hasVariants] of games) {
  await sql`INSERT INTO games (id, group_id, name, type, metric_direction, parser_id, has_variants)
    VALUES (${id}, 'g1', ${name}, ${type}, ${dir}, ${parserId}, ${hasVariants})
    ON CONFLICT (id) DO NOTHING`;
}

console.log(`Seed complete (${games.length} games).`);
