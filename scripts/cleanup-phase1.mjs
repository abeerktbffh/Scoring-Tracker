// Phase 1 destructive cleanup (multi-group migration).
//
// DESTRUCTIVE — drops tables/columns/rows that are now vestigial now that
// the multi-group feature is live. Run this ONCE, after verifying the live
// app is healthy on the new multi-group code path, and ONLY after taking a
// prod database backup. This script is NOT run by CI or by an agent — it is
// a guided step the controller runs manually with the owner's explicit
// go-ahead:
//   set -a && . ./.env.local && set +a && node scripts/cleanup-phase1.mjs
//
// Mirrors scripts/migrate.mjs's Neon connection. Statements run in FK
// dependency order (children before parents / referenced columns).
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// join_eligibility -> FK to invites, groups, users
await sql`DROP TABLE IF EXISTS join_eligibility`;

// claims -> FK to groups, players, users
await sql`DROP TABLE IF EXISTS claims`;

// invites -> legacy (Phase 2a uses groups.invite_token*), FK to groups, users
await sql`DROP TABLE IF EXISTS invites`;

// old index on entries(group_id, ...), superseded by entries_active_uq
await sql`DROP INDEX IF EXISTS entries_active_idx`;

// entries.group_id -> FK to groups
await sql`ALTER TABLE entries DROP COLUMN IF EXISTS group_id`;

// entries.player_id -> FK to players
await sql`ALTER TABLE entries DROP COLUMN IF EXISTS player_id`;

// players -> now unreferenced (claims gone, entries.player_id gone); its
// indexes (players_group_user_uq, players_group_lower_name_uq) drop with it
await sql`DROP TABLE IF EXISTS players`;

// games.group_id -> FK to groups
await sql`ALTER TABLE games DROP COLUMN IF EXISTS group_id`;

// legacy group row; nothing references it now (memberships/group_games only
// reference user-created groups)
await sql`DELETE FROM groups WHERE id = 'g1'`;

await sql`ALTER TABLE groups DROP COLUMN IF EXISTS passphrase_hash`;
await sql`ALTER TABLE groups DROP COLUMN IF EXISTS admin_passphrase_hash`;
await sql`ALTER TABLE groups DROP COLUMN IF EXISTS timezone`;

console.log("Phase 1 cleanup complete.");
