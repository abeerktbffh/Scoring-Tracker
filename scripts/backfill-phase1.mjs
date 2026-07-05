// Phase 1 identity backfill (multi-group migration).
//
// Mirrors scripts/migrate.mjs's Neon connection. Idempotent and safe to
// re-run: every UPDATE is scoped to rows that still need it (`WHERE ... IS
// NULL`), the collision/completeness gates are pure reads, and the unique
// index uses `CREATE UNIQUE INDEX IF NOT EXISTS`. Never drops or overwrites
// existing data.
//
// This script is NOT run by CI or by an agent — it is a guided step the
// controller runs manually against preview first, then prod, with the
// owner's go-ahead:
//   set -a && . ./.env.local && set +a && OWNER_EMAIL=... node scripts/backfill-phase1.mjs
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// Plain Node ESM can't import a .ts file directly (no loader is configured
// for `node scripts/*.mjs`), so this mirrors src/lib/backfillVerify.ts's
// `summarize` verbatim. Keep the two in sync — the unit-tested version in
// src/lib is the source of truth for the gating logic/shape; this copy is
// what actually runs against the DB.
function summarize({ nameCollisionRows, entriesMissingUserIdRows, usersMissingNameRows }) {
  const nameCollisions = nameCollisionRows;
  const entriesMissingUserId = Number(entriesMissingUserIdRows[0]?.c ?? 0);
  const usersMissingName = Number(usersMissingNameRows[0]?.c ?? 0);
  const ok = nameCollisions.length === 0 && entriesMissingUserId === 0;
  return { ok, nameCollisions, entriesMissingUserId, usersMissingName };
}

if (!process.env.OWNER_EMAIL) {
  console.error("ABORT: OWNER_EMAIL is not set");
  process.exit(1);
}

// 1. Backfill display names from the single players row per user.
await sql`UPDATE users u SET display_name = p.display_name FROM players p WHERE p.user_id = u.id AND u.display_name IS NULL`;

// 2. Backfill entries.user_id from the owning player.
await sql`UPDATE entries e SET user_id = p.user_id FROM players p WHERE e.player_id = p.id AND e.user_id IS NULL`;

// 3. Set the platform owner as super-admin (idempotent; email is the owner's).
await sql`UPDATE users SET is_super_admin = true WHERE email = ${process.env.OWNER_EMAIL}`;

// 4-5. Verify: no case-insensitive display-name collisions, no entries left
// without a user_id. Reduced by the pure, unit-tested `summarize` shape so
// the gating decision itself is testable without a DB. `usersMissingName`
// is surfaced for visibility (e.g. users with no players row ever set one)
// but is not a hard gate — it doesn't block the index creation below.
const nameCollisionRows = await sql`
  SELECT lower(display_name) AS n, count(*) c
  FROM users
  WHERE display_name IS NOT NULL
  GROUP BY 1
  HAVING count(*) > 1
`;
const entriesMissingUserIdRows = await sql`
  SELECT count(*) c FROM entries WHERE user_id IS NULL AND player_id IS NOT NULL
`;
const usersMissingNameRows = await sql`
  SELECT count(*) c FROM users WHERE display_name IS NULL
`;

const result = summarize({ nameCollisionRows, entriesMissingUserIdRows, usersMissingNameRows });

if (result.usersMissingName > 0) {
  console.warn("WARNING: users without display_name", result.usersMissingName);
}

if (!result.ok) {
  if (result.nameCollisions.length > 0) {
    console.error("ABORT: name collisions", result.nameCollisions);
  }
  if (result.entriesMissingUserId > 0) {
    console.error("ABORT: entries without user_id", result.entriesMissingUserId);
  }
  process.exit(1);
}

// 6. Create the global-name unique index (only now that the gate passed).
// Name must stay exactly `users_display_name_lower_uq` — src/lib/identity.ts
// catches a 23505 on this exact constraint name for the clean-409 path.
await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_display_name_lower_uq ON users (lower(display_name))`;

console.log("Phase 1 backfill complete.");
