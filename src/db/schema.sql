CREATE TABLE IF NOT EXISTS groups (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
  id               TEXT PRIMARY KEY,
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

-- === Global identity (Phase 1 multi-group) — display name + platform super-admin ===
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
ALTER TABLE groups ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id);

-- One active entry per user/game/day/variant (DB-enforced, replaces the plain entries_active_idx for dedup)
-- COALESCE(variant, '') collapses NULL-variant games to a single indexable value: Postgres
-- treats each NULL as distinct in a unique index, so without this, two concurrent inserts for
-- the same user/game/day with variant IS NULL would both succeed. No game uses '' as an actual
-- variant (variants are non-empty labels or absent), so this is safe.
CREATE UNIQUE INDEX IF NOT EXISTS entries_active_uq
  ON entries (user_id, game_id, puzzle_date, COALESCE(variant, ''))
  WHERE superseded_by IS NULL;

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

