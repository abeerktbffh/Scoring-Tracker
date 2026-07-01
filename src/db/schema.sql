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
