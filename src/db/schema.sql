CREATE TABLE IF NOT EXISTS groups (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  passphrase_hash TEXT NOT NULL,
  admin_passphrase_hash TEXT,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE groups ADD COLUMN IF NOT EXISTS admin_passphrase_hash TEXT;

CREATE TABLE IF NOT EXISTS players (
  id           TEXT PRIMARY KEY,
  group_id     TEXT NOT NULL REFERENCES groups(id),
  display_name TEXT NOT NULL,
  pin_hash     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, display_name)
);

CREATE TABLE IF NOT EXISTS games (
  id               TEXT PRIMARY KEY,
  group_id         TEXT NOT NULL REFERENCES groups(id),
  name             TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('outcome','timed')),
  metric_direction TEXT NOT NULL CHECK (metric_direction IN ('lower_better','higher_better')),
  parser_id        TEXT,
  has_variants     BOOLEAN NOT NULL DEFAULT false,
  icon             TEXT,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entries (
  id            TEXT PRIMARY KEY,
  group_id      TEXT NOT NULL REFERENCES groups(id),
  player_id     TEXT NOT NULL REFERENCES players(id),
  game_id       TEXT NOT NULL REFERENCES games(id),
  variant       TEXT,
  puzzle_date   DATE NOT NULL,
  puzzle_number INTEGER,
  raw_input     TEXT,
  parsed_value  DOUBLE PRECISION NOT NULL,
  solved        BOOLEAN NOT NULL,
  is_late       BOOLEAN NOT NULL DEFAULT false,
  version       INTEGER NOT NULL DEFAULT 1,
  superseded_by TEXT REFERENCES entries(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entries_active_idx
  ON entries (group_id, game_id, puzzle_date)
  WHERE superseded_by IS NULL;

-- === Identity (Auth.js-compatible) ===
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  name           TEXT,
  email          TEXT UNIQUE,
  email_verified TIMESTAMPTZ,
  image          TEXT,
  password_hash  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                TEXT NOT NULL,
  provider            TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token       TEXT,
  access_token        TEXT,
  expires_at          BIGINT,
  token_type          TEXT,
  scope               TEXT,
  id_token            TEXT,
  session_state       TEXT,
  UNIQUE (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS verification_token (
  identifier TEXT NOT NULL,
  token      TEXT NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  purpose    TEXT NOT NULL DEFAULT 'verify',
  PRIMARY KEY (identifier, token)
);

-- === Players become memberships ===
ALTER TABLE players ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE players ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE players ALTER COLUMN pin_hash DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS players_group_user_uq
  ON players (group_id, user_id) WHERE user_id IS NOT NULL;

-- Case-insensitive display-name uniqueness within a group (backstop for the
-- race window between an app-level pre-check and the INSERT/UPDATE) --
-- keep the existing UNIQUE (group_id, display_name) too, it is harmless
CREATE UNIQUE INDEX IF NOT EXISTS players_group_lower_name_uq
  ON players (group_id, lower(display_name));

-- === Claims (migration-only, audited) ===
CREATE TABLE IF NOT EXISTS claims (
  id                 TEXT PRIMARY KEY,
  group_id           TEXT NOT NULL REFERENCES groups(id),
  player_id          TEXT NOT NULL REFERENCES players(id),
  claimed_by_user_id TEXT NOT NULL REFERENCES users(id),
  claim_status       TEXT NOT NULL DEFAULT 'pending' CHECK (claim_status IN ('pending','approved','rejected')),
  claimed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by        TEXT REFERENCES users(id),
  decided_at         TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS claims_one_pending_per_player
  ON claims (player_id) WHERE claim_status = 'pending';

-- === Invites (join gate — store token HASH only) ===
CREATE TABLE IF NOT EXISTS invites (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES groups(id),
  token_hash  TEXT NOT NULL UNIQUE,
  created_by  TEXT REFERENCES users(id),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT false,
  max_uses    INTEGER,
  uses        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- === Join eligibility (server-side proof that an authed user redeemed a valid invite) ===
CREATE TABLE IF NOT EXISTS join_eligibility (
  user_id    TEXT NOT NULL REFERENCES users(id),
  group_id   TEXT NOT NULL REFERENCES groups(id),
  invite_id  TEXT REFERENCES invites(id),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, group_id)
);

-- === Global identity (Phase 1 multi-group) — display name + platform super-admin ===
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
ALTER TABLE groups ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id);

-- One active entry per user/game/day/variant (DB-enforced; replaces the plain entries_active_idx for dedup)
-- COALESCE(variant, '') collapses NULL-variant games to a single indexable value: Postgres
-- treats each NULL as distinct in a unique index, so without this, two concurrent inserts for
-- the same user/game/day with variant IS NULL would both succeed. No game uses '' as an actual
-- variant (variants are non-empty labels or absent), so this is safe.
CREATE UNIQUE INDEX IF NOT EXISTS entries_active_uq
  ON entries (user_id, game_id, puzzle_date, COALESCE(variant, ''))
  WHERE superseded_by IS NULL;

-- Phase 1 cutover prerequisites: relax legacy NOT NULLs so user-scoped writes and global catalog inserts are valid
ALTER TABLE entries ALTER COLUMN group_id DROP NOT NULL;
ALTER TABLE entries ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE games ALTER COLUMN group_id DROP NOT NULL;

-- === Multi-group Phase 2: memberships, per-group game selection, invite token ===
CREATE TABLE IF NOT EXISTS memberships (
  id         TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT memberships_group_user_uq UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships (user_id);

CREATE TABLE IF NOT EXISTS group_games (
  group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  game_id   TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, game_id)
);

ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_token_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS groups_invite_token_hash_uq ON groups (invite_token_hash) WHERE invite_token_hash IS NOT NULL;

-- Phase 2a addendum: plaintext invite token stored so any member can re-display the current link
-- (low-sensitivity join link, owner-approved) without needing to rotate it via reset
ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_token TEXT;

-- Phase 2 cutover prerequisite: relax legacy NOT NULLs so INSERT INTO groups (id, name, created_by, invite_token_hash) is valid regardless of deploy ordering
ALTER TABLE groups ALTER COLUMN passphrase_hash DROP NOT NULL;
ALTER TABLE groups ALTER COLUMN timezone DROP NOT NULL;
