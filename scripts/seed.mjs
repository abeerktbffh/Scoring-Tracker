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
  ["strands", "Strands", "outcome", "lower_better", "strands", false],
  ["india-mini", "India Mini", "timed", "lower_better", "india-mini", false],
  ["zip", "Zip", "timed", "lower_better", "zip", false],
  ["crossclimb", "Crossclimb", "timed", "lower_better", "crossclimb", false],
  ["patches", "Patches", "timed", "lower_better", "patches", false],
  ["pinpoint", "Pinpoint", "outcome", "lower_better", "pinpoint", false],
  ["wend", "Wend", "timed", "lower_better", "wend", false],
  // Manual-only for now (no parser yet) — still fully loggable via manual entry.
  ["nyt-mini", "NYT Mini", "timed", "lower_better", null, false],
];

for (const [id, name, type, dir, parserId, hasVariants] of games) {
  await sql`INSERT INTO games (id, group_id, name, type, metric_direction, parser_id, has_variants)
    VALUES (${id}, 'g1', ${name}, ${type}, ${dir}, ${parserId}, ${hasVariants})
    ON CONFLICT (id) DO NOTHING`;
}

// Backfill parser_id for games whose rows pre-date their parser
// (ON CONFLICT above won't update an existing row). Metadata only; parser
// resolution happens in code. Every parser's gameId equals its game id.
await sql`UPDATE games SET parser_id = id
  WHERE group_id = 'g1' AND parser_id IS NULL
    AND id IN ('strands','zip','crossclimb','patches','pinpoint')`;

console.log(`Seed complete (${games.length} games).`);
