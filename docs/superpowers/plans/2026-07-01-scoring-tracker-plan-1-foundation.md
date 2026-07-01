# Scoring Tracker — Plan 1: Foundation + Walking Skeleton

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an end-to-end vertical slice — a friend enters the group passphrase, claims a name with a PIN, pastes a Wordle result, and sees a wins-based leaderboard.

**Architecture:** A single Next.js (App Router, TypeScript) app on Vercel, backed by Neon Postgres via its pooled serverless driver. Pure-function libraries (`parsers/`, `scoring/`) are built and unit-tested in isolation with no DB. Auth is a signed (HS256) group token in a cookie plus per-player PINs, enforced server-side on every API route. Entries are append-only (versioned rows).

**Tech Stack:** Next.js 14+ (App Router), TypeScript, Vitest, `@neondatabase/serverless`, `jose` (JWT), Node `crypto` (scrypt) for secret hashing.

## Global Constraints

- **Runtime:** Node.js API routes (not Edge) — `crypto.scrypt` and the Neon driver run on the Node runtime. Add `export const runtime = 'nodejs'` to every route.
- **Free-tier only, no card:** Vercel Hobby + Neon free tier + `*.vercel.app`. No dependency that can silently bill.
- **DB access:** ALWAYS through the single pooled client in `src/db/client.ts`. Never open ad-hoc connections. All queries parameterized (tagged-template `sql`), never string-concatenated.
- **Security:** passphrase enforced server-side on every API route via signed token; PIN required to post as a player. Never `dangerouslySetInnerHTML`. Secrets (passphrase, PIN) stored only as scrypt hashes.
- **Append-only entries:** corrections insert a new version and mark the prior row superseded; never UPDATE a stored score in place.
- **`group_id` everywhere:** every domain table carries `group_id` even though v1 hardcodes one group.
- **Env vars:** `DATABASE_URL`, `AUTH_SECRET` (32+ random bytes). Never commit them; `.env.local` is git-ignored.
- **TDD:** every code task is failing test → run (fail) → minimal impl → run (pass) → commit.

---

### Task 1: Project scaffold + test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/lib/env.ts`
- Test: `src/lib/env.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `getEnv(key: string): string` in `src/lib/env.ts` — returns a required env var or throws `Error("Missing env var: <key>")`. Used by db/client and auth.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "scoring-tracker",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "node --loader tsx scripts/migrate.mjs"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.9.4",
    "jose": "^5.6.3",
    "next": "^14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.11",
    "@types/react": "^18.3.3",
    "typescript": "^5.5.3",
    "vitest": "^2.0.4"
  }
}
```

- [ ] **Step 2: Create config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "incremental": true,
    "paths": { "@/*": ["./src/*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

`vitest.setup.ts`:
```ts
process.env.AUTH_SECRET ||= "test-secret-value-at-least-32-bytes-long!";
process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
```

`.gitignore`:
```
node_modules
.next
.env.local
*.tsbuildinfo
next-env.d.ts
```

`.env.example`:
```
DATABASE_URL=postgres://user:pass@host/db
AUTH_SECRET=generate-with-openssl-rand-hex-32
```

- [ ] **Step 3: Write the failing test for `getEnv`**

`src/lib/env.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getEnv } from "./env";

describe("getEnv", () => {
  it("returns the value when set", () => {
    process.env.SOME_KEY = "hello";
    expect(getEnv("SOME_KEY")).toBe("hello");
  });

  it("throws when missing", () => {
    delete process.env.MISSING_KEY;
    expect(() => getEnv("MISSING_KEY")).toThrow("Missing env var: MISSING_KEY");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm install && npm test -- env`
Expected: FAIL — cannot find module `./env`.

- [ ] **Step 5: Implement `getEnv`**

`src/lib/env.ts`:
```ts
export function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}
```

- [ ] **Step 6: Create minimal app shell so `next build` works**

`src/app/layout.tsx`:
```tsx
export const metadata = { title: "Scoring Tracker" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:
```tsx
export default function Home() {
  return <main>Scoring Tracker</main>;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- env`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json next.config.mjs vitest.config.ts vitest.setup.ts .gitignore .env.example src/
git commit -m "chore: scaffold Next.js app with Vitest and env helper"
```

---

### Task 2: Database schema, pooled client, migration + seed

**Files:**
- Create: `src/db/schema.sql`, `src/db/client.ts`, `scripts/migrate.mjs`, `scripts/seed.mjs`
- Test: `src/db/client.test.ts`

**Interfaces:**
- Consumes: `getEnv` from Task 1.
- Produces: `sql` tagged-template query function exported from `src/db/client.ts` (the Neon serverless client). Signature: `sql\`SELECT ...\`` returns `Promise<Row[]>`. All later DB code imports this.

- [ ] **Step 1: Write the schema**

`src/db/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS groups (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  passphrase_hash TEXT NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
```

- [ ] **Step 2: Write the pooled client**

`src/db/client.ts`:
```ts
import { neon } from "@neondatabase/serverless";
import { getEnv } from "@/lib/env";

// Neon's HTTP driver is connection-pooled by design — safe for serverless.
export const sql = neon(getEnv("DATABASE_URL"));
```

- [ ] **Step 3: Write the failing test**

`src/db/client.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sql } from "./client";

describe("db client", () => {
  it("exports a callable sql tagged-template function", () => {
    expect(typeof sql).toBe("function");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- client`
Expected: FAIL — cannot find module `./client`.

- [ ] **Step 5: Confirm client already satisfies the test**

The file from Step 2 satisfies it. (No DB connection is made at import time.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- client`
Expected: PASS (1 test).

- [ ] **Step 7: Write migration + seed scripts**

`scripts/migrate.mjs`:
```js
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const schema = readFileSync(new URL("../src/db/schema.sql", import.meta.url), "utf8");

for (const statement of schema.split(";").map((s) => s.trim()).filter(Boolean)) {
  await sql.query(statement);
}
console.log("Migration complete.");
```

`scripts/seed.mjs` (creates the one group + the Wordle game; passphrase hashing is added in Task 3, so this seeds a placeholder hash to be replaced by the CLI in Task 3 Step 8):
```js
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

await sql`INSERT INTO groups (id, name, passphrase_hash)
  VALUES ('g1', 'Friends', 'REPLACE_ME')
  ON CONFLICT (id) DO NOTHING`;

await sql`INSERT INTO games (id, group_id, name, type, metric_direction, parser_id)
  VALUES ('wordle', 'g1', 'Wordle', 'outcome', 'lower_better', 'wordle')
  ON CONFLICT (id) DO NOTHING`;

console.log("Seed complete.");
```

- [ ] **Step 8: Commit**

```bash
git add src/db/ scripts/migrate.mjs scripts/seed.mjs
git commit -m "feat: add DB schema, pooled Neon client, migrate/seed scripts"
```

---

### Task 3: Secret hashing (scrypt) + set-passphrase CLI

**Files:**
- Create: `src/auth/hash.ts`, `scripts/set-passphrase.mjs`
- Test: `src/auth/hash.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `hashSecret(secret: string): Promise<string>` → `"<saltHex>:<keyHex>"`.
  - `verifySecret(secret: string, stored: string): Promise<boolean>` — constant-time compare.
  Used by auth API routes (passphrase + PIN) in Task 5/6.

- [ ] **Step 1: Write the failing test**

`src/auth/hash.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hashSecret, verifySecret } from "./hash";

describe("secret hashing", () => {
  it("verifies a correct secret", async () => {
    const stored = await hashSecret("hunter2");
    expect(await verifySecret("hunter2", stored)).toBe(true);
  });

  it("rejects a wrong secret", async () => {
    const stored = await hashSecret("hunter2");
    expect(await verifySecret("wrong", stored)).toBe(false);
  });

  it("produces different hashes for the same input (random salt)", async () => {
    const a = await hashSecret("same");
    const b = await hashSecret("same");
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- hash`
Expected: FAIL — cannot find module `./hash`.

- [ ] **Step 3: Implement hashing**

`src/auth/hash.ts`:
```ts
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(secret, salt, KEYLEN)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [salt, keyHex] = stored.split(":");
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, "hex");
  const derived = (await scryptAsync(secret, salt, KEYLEN)) as Buffer;
  return keyBuf.length === derived.length && timingSafeEqual(keyBuf, derived);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- hash`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the set-passphrase CLI**

`scripts/set-passphrase.mjs`:
```js
import { neon } from "@neondatabase/serverless";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const sql = neon(process.env.DATABASE_URL);
const passphrase = process.argv[2];
if (!passphrase) {
  console.error("Usage: node scripts/set-passphrase.mjs <passphrase>");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
const key = (await scryptAsync(passphrase, salt, 64)).toString("hex");
await sql`UPDATE groups SET passphrase_hash = ${`${salt}:${key}`} WHERE id = 'g1'`;
console.log("Passphrase set for group g1.");
```

- [ ] **Step 6: Commit**

```bash
git add src/auth/hash.ts src/auth/hash.test.ts scripts/set-passphrase.mjs
git commit -m "feat: scrypt secret hashing and set-passphrase CLI"
```

---

### Task 4: Signed group token (jose HS256)

**Files:**
- Create: `src/auth/token.ts`
- Test: `src/auth/token.test.ts`

**Interfaces:**
- Consumes: `getEnv` from Task 1.
- Produces:
  - `issueGroupToken(groupId: string): Promise<string>`
  - `verifyGroupToken(token: string): Promise<{ groupId: string } | null>` — returns null on any failure.
  Used by the auth + entries API routes.

- [ ] **Step 1: Write the failing test**

`src/auth/token.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { issueGroupToken, verifyGroupToken } from "./token";

describe("group token", () => {
  it("round-trips a valid token", async () => {
    const token = await issueGroupToken("g1");
    expect(await verifyGroupToken(token)).toEqual({ groupId: "g1" });
  });

  it("returns null for a tampered token", async () => {
    const token = await issueGroupToken("g1");
    expect(await verifyGroupToken(token + "x")).toBeNull();
  });

  it("returns null for garbage", async () => {
    expect(await verifyGroupToken("not-a-token")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- token`
Expected: FAIL — cannot find module `./token`.

- [ ] **Step 3: Implement the token module**

`src/auth/token.ts`:
```ts
import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "@/lib/env";

function key(): Uint8Array {
  return new TextEncoder().encode(getEnv("AUTH_SECRET"));
}

export async function issueGroupToken(groupId: string): Promise<string> {
  return new SignJWT({ groupId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(key());
}

export async function verifyGroupToken(
  token: string,
): Promise<{ groupId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.groupId !== "string") return null;
    return { groupId: payload.groupId };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- token`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/auth/token.ts src/auth/token.test.ts
git commit -m "feat: signed HS256 group token issue/verify"
```

---

### Task 5: Wordle parser (establishes the parser pattern)

**Files:**
- Create: `src/parsers/types.ts`, `src/parsers/wordle.ts`, `src/parsers/registry.ts`
- Test: `src/parsers/wordle.test.ts`, `src/parsers/registry.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `ParseResult` type: `{ gameId: string; puzzleNumber: number | null; variant: string | null; value: number; solved: boolean }`.
  - `Parser` type: `{ gameId: string; detect(text: string): boolean; parse(text: string): ParseResult }`.
  - `detectAndParse(text: string): ParseResult | null` from `registry.ts`.
  Used by the entries API route (Task 7).

- [ ] **Step 1: Write the types**

`src/parsers/types.ts`:
```ts
export interface ParseResult {
  gameId: string;
  puzzleNumber: number | null;
  variant: string | null;
  value: number;
  solved: boolean;
}

export interface Parser {
  gameId: string;
  detect(text: string): boolean;
  parse(text: string): ParseResult;
}
```

- [ ] **Step 2: Write the failing Wordle test**

`src/parsers/wordle.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { wordleParser } from "./wordle";

describe("wordle parser", () => {
  it("detects Wordle share text", () => {
    expect(wordleParser.detect("Wordle 1,234 3/6\n\n⬛🟨⬛⬛⬛")).toBe(true);
    expect(wordleParser.detect("Connections\nPuzzle #123")).toBe(false);
  });

  it("parses a solved result with a comma-formatted puzzle number", () => {
    expect(wordleParser.parse("Wordle 1,234 3/6\n\n⬛🟨⬛⬛⬛")).toEqual({
      gameId: "wordle",
      puzzleNumber: 1234,
      variant: null,
      value: 3,
      solved: true,
    });
  });

  it("parses a failed result (X/6) as unsolved with value 7", () => {
    expect(wordleParser.parse("Wordle 900 X/6")).toEqual({
      gameId: "wordle",
      puzzleNumber: 900,
      variant: null,
      value: 7,
      solved: false,
    });
  });

  it("throws on unparseable text", () => {
    expect(() => wordleParser.parse("hello world")).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- wordle`
Expected: FAIL — cannot find module `./wordle`.

- [ ] **Step 4: Implement the Wordle parser**

`src/parsers/wordle.ts`:
```ts
import type { Parser, ParseResult } from "./types";

const LINE = /Wordle\s+([\d,]+)\s+([X\d])\/6/i;

export const wordleParser: Parser = {
  gameId: "wordle",
  detect(text: string): boolean {
    return LINE.test(text);
  },
  parse(text: string): ParseResult {
    const m = text.match(LINE);
    if (!m) throw new Error("Not a Wordle result");
    const puzzleNumber = Number(m[1].replace(/,/g, ""));
    const guesses = m[2].toUpperCase();
    const solved = guesses !== "X";
    return {
      gameId: "wordle",
      puzzleNumber,
      variant: null,
      value: solved ? Number(guesses) : 7,
      solved,
    };
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- wordle`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing registry test**

`src/parsers/registry.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { detectAndParse } from "./registry";

describe("detectAndParse", () => {
  it("routes Wordle text to the Wordle parser", () => {
    const r = detectAndParse("Wordle 1,234 3/6");
    expect(r?.gameId).toBe("wordle");
    expect(r?.value).toBe(3);
  });

  it("returns null when no parser matches", () => {
    expect(detectAndParse("random text nobody parses")).toBeNull();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- registry`
Expected: FAIL — cannot find module `./registry`.

- [ ] **Step 8: Implement the registry**

`src/parsers/registry.ts`:
```ts
import type { ParseResult } from "./types";
import { wordleParser } from "./wordle";

export const parsers = [wordleParser];

export function detectAndParse(text: string): ParseResult | null {
  const parser = parsers.find((p) => p.detect(text));
  if (!parser) return null;
  try {
    return parser.parse(text);
  } catch {
    return null;
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- registry`
Expected: PASS (2 tests).

- [ ] **Step 10: Commit**

```bash
git add src/parsers/
git commit -m "feat: parser types, Wordle parser, and detect-and-parse registry"
```

---

### Task 6: Wins tally (pure scoring function)

**Files:**
- Create: `src/scoring/wins.ts`
- Test: `src/scoring/wins.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `GameEntry` type: `{ playerId: string; gameId: string; variant: string | null; puzzleKey: string; value: number; solved: boolean; direction: "lower_better" | "higher_better" }`.
  - `tallyWins(entries: GameEntry[]): { playerId: string; wins: number }[]` — sorted by wins desc, then playerId asc. Ties in a game → all tied players win; unsolved never beats solved; solo entry wins.
  Used by the leaderboard API route (Task 7).

- [ ] **Step 1: Write the failing test**

`src/scoring/wins.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { tallyWins, type GameEntry } from "./wins";

const base = { gameId: "wordle", variant: null, puzzleKey: "wordle|1234", direction: "lower_better" as const };

describe("tallyWins", () => {
  it("awards the win to the best (lowest) value", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 3, solved: true },
      { ...base, playerId: "b", value: 4, solved: true },
    ];
    expect(tallyWins(entries)).toEqual([
      { playerId: "a", wins: 1 },
      { playerId: "b", wins: 0 },
    ]);
  });

  it("gives co-wins on a tie", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 3, solved: true },
      { ...base, playerId: "b", value: 3, solved: true },
    ];
    expect(tallyWins(entries)).toEqual([
      { playerId: "a", wins: 1 },
      { playerId: "b", wins: 1 },
    ]);
  });

  it("never lets an unsolved entry beat a solved one", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 7, solved: false },
      { ...base, playerId: "b", value: 6, solved: true },
    ];
    expect(tallyWins(entries)).toEqual([
      { playerId: "b", wins: 1 },
      { playerId: "a", wins: 0 },
    ]);
  });

  it("gives a solo player the win", () => {
    const entries: GameEntry[] = [{ ...base, playerId: "a", value: 5, solved: true }];
    expect(tallyWins(entries)).toEqual([{ playerId: "a", wins: 1 }]);
  });

  it("sums wins across separate games/puzzles", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 3, solved: true },
      { ...base, playerId: "b", value: 4, solved: true },
      { gameId: "mini", variant: null, puzzleKey: "mini|2026-07-01", direction: "lower_better", playerId: "b", value: 40, solved: true },
      { gameId: "mini", variant: null, puzzleKey: "mini|2026-07-01", direction: "lower_better", playerId: "a", value: 55, solved: true },
    ];
    expect(tallyWins(entries)).toEqual([
      { playerId: "a", wins: 1 },
      { playerId: "b", wins: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- wins`
Expected: FAIL — cannot find module `./wins`.

- [ ] **Step 3: Implement `tallyWins`**

`src/scoring/wins.ts`:
```ts
export interface GameEntry {
  playerId: string;
  gameId: string;
  variant: string | null;
  puzzleKey: string;
  value: number;
  solved: boolean;
  direction: "lower_better" | "higher_better";
}

function isBetter(a: number, b: number, dir: GameEntry["direction"]): boolean {
  return dir === "lower_better" ? a < b : a > b;
}

export function tallyWins(entries: GameEntry[]): { playerId: string; wins: number }[] {
  const wins = new Map<string, number>();
  for (const e of entries) wins.set(e.playerId, wins.get(e.playerId) ?? 0);

  // Group by game + variant + puzzle.
  const groups = new Map<string, GameEntry[]>();
  for (const e of entries) {
    const key = `${e.gameId}|${e.variant ?? ""}|${e.puzzleKey}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
  }

  for (const group of groups.values()) {
    const solved = group.filter((e) => e.solved);
    const contenders = solved.length > 0 ? solved : [];
    if (contenders.length === 0) continue;
    let best = contenders[0].value;
    for (const e of contenders) if (isBetter(e.value, best, e.direction)) best = e.value;
    for (const e of contenders) if (e.value === best) wins.set(e.playerId, wins.get(e.playerId)! + 1);
  }

  return [...wins.entries()]
    .map(([playerId, w]) => ({ playerId, wins: w }))
    .sort((a, b) => b.wins - a.wins || a.playerId.localeCompare(b.playerId));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- wins`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scoring/
git commit -m "feat: pure tallyWins scoring function with ties and solo wins"
```

---

### Task 7: API routes — auth, entries submit, leaderboard

**Files:**
- Create: `src/lib/ids.ts`, `src/app/api/auth/route.ts`, `src/app/api/entries/route.ts`, `src/app/api/leaderboard/route.ts`
- Test: `src/lib/ids.test.ts`

**Interfaces:**
- Consumes: `sql` (Task 2), `hashSecret`/`verifySecret` (Task 3), `issueGroupToken`/`verifyGroupToken` (Task 4), `detectAndParse` (Task 5), `tallyWins`/`GameEntry` (Task 6).
- Produces: three HTTP endpoints (contracts below). `newId(prefix: string): string` from `src/lib/ids.ts`.
  - `POST /api/auth` — body `{ passphrase }` → sets `group_token` httpOnly cookie, returns `{ ok: true }` or 401.
  - `POST /api/entries` — cookie `group_token` required; body `{ displayName, pin, rawInput }` → parses, upserts player (creating with PIN on first claim, else verifying PIN), inserts append-only entry. Returns `{ ok: true, parsed }` or 4xx.
  - `GET /api/leaderboard` — cookie required; returns `{ players: { displayName, wins }[] }` for today (group timezone).

- [ ] **Step 1: Write the failing test for `newId`**

`src/lib/ids.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { newId } from "./ids";

describe("newId", () => {
  it("prefixes and is unique", () => {
    const a = newId("e");
    const b = newId("e");
    expect(a.startsWith("e_")).toBe(true);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ids`
Expected: FAIL — cannot find module `./ids`.

- [ ] **Step 3: Implement `newId`**

`src/lib/ids.ts`:
```ts
import { randomUUID } from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ids`
Expected: PASS (1 test).

- [ ] **Step 5: Implement the auth route**

`src/app/api/auth/route.ts`:
```ts
import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { verifySecret } from "@/auth/hash";
import { issueGroupToken } from "@/auth/token";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { passphrase } = await req.json().catch(() => ({}));
  if (typeof passphrase !== "string") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const rows = (await sql`SELECT id, passphrase_hash FROM groups WHERE id = 'g1'`) as {
    id: string;
    passphrase_hash: string;
  }[];
  const group = rows[0];
  if (!group || !(await verifySecret(passphrase, group.passphrase_hash))) {
    return NextResponse.json({ error: "Wrong passphrase" }, { status: 401 });
  }
  const token = await issueGroupToken(group.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("group_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
```

- [ ] **Step 6: Implement the entries route**

`src/app/api/entries/route.ts`:
```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";
import { hashSecret, verifySecret } from "@/auth/hash";
import { detectAndParse } from "@/parsers/registry";
import { newId } from "@/lib/ids";

export const runtime = "nodejs";

async function requireGroup(): Promise<string | null> {
  const token = cookies().get("group_token")?.value;
  if (!token) return null;
  const payload = await verifyGroupToken(token);
  return payload?.groupId ?? null;
}

export async function POST(req: Request) {
  const groupId = await requireGroup();
  if (!groupId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { displayName, pin, rawInput } = body as {
    displayName?: string;
    pin?: string;
    rawInput?: string;
  };
  if (!displayName || !pin || !rawInput) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const parsed = detectAndParse(rawInput);
  if (!parsed) {
    return NextResponse.json({ error: "Could not parse result" }, { status: 422 });
  }

  // Find or create the player, enforcing PIN.
  const existing = (await sql`
    SELECT id, pin_hash FROM players WHERE group_id = ${groupId} AND display_name = ${displayName}
  `) as { id: string; pin_hash: string }[];

  let playerId: string;
  if (existing[0]) {
    if (!(await verifySecret(pin, existing[0].pin_hash))) {
      return NextResponse.json({ error: "Wrong PIN" }, { status: 403 });
    }
    playerId = existing[0].id;
  } else {
    playerId = newId("p");
    await sql`
      INSERT INTO players (id, group_id, display_name, pin_hash)
      VALUES (${playerId}, ${groupId}, ${displayName}, ${await hashSecret(pin)})
    `;
  }

  // Verify the game exists in this group.
  const game = (await sql`
    SELECT id FROM games WHERE id = ${parsed.gameId} AND group_id = ${groupId}
  `) as { id: string }[];
  if (!game[0]) return NextResponse.json({ error: "Unknown game" }, { status: 422 });

  // Append-only: supersede any prior active entry for this player/game/variant/day.
  const puzzleDate = new Date().toISOString().slice(0, 10);
  const priorRows = (await sql`
    SELECT id, version FROM entries
    WHERE group_id = ${groupId} AND player_id = ${playerId} AND game_id = ${parsed.gameId}
      AND puzzle_date = ${puzzleDate} AND (variant IS NOT DISTINCT FROM ${parsed.variant})
      AND superseded_by IS NULL
  `) as { id: string; version: number }[];

  const entryId = newId("e");
  const version = (priorRows[0]?.version ?? 0) + 1;
  await sql`
    INSERT INTO entries (id, group_id, player_id, game_id, variant, puzzle_date,
      puzzle_number, raw_input, parsed_value, solved, is_late, version)
    VALUES (${entryId}, ${groupId}, ${playerId}, ${parsed.gameId}, ${parsed.variant},
      ${puzzleDate}, ${parsed.puzzleNumber}, ${rawInput}, ${parsed.value}, ${parsed.solved}, false, ${version})
  `;
  if (priorRows[0]) {
    await sql`UPDATE entries SET superseded_by = ${entryId} WHERE id = ${priorRows[0].id}`;
  }

  return NextResponse.json({ ok: true, parsed });
}
```

- [ ] **Step 7: Implement the leaderboard route**

`src/app/api/leaderboard/route.ts`:
```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";
import { tallyWins, type GameEntry } from "@/scoring/wins";

export const runtime = "nodejs";

export async function GET() {
  const token = cookies().get("group_token")?.value;
  const payload = token ? await verifyGroupToken(token) : null;
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const groupId = payload.groupId;

  const puzzleDate = new Date().toISOString().slice(0, 10);
  const rows = (await sql`
    SELECT e.player_id, p.display_name, e.game_id, e.variant, e.puzzle_date,
           e.puzzle_number, e.parsed_value, e.solved, g.metric_direction
    FROM entries e
    JOIN players p ON p.id = e.player_id
    JOIN games g ON g.id = e.game_id
    WHERE e.group_id = ${groupId} AND e.puzzle_date = ${puzzleDate}
      AND e.superseded_by IS NULL AND e.is_late = false
  `) as {
    player_id: string;
    display_name: string;
    game_id: string;
    variant: string | null;
    puzzle_date: string;
    puzzle_number: number | null;
    parsed_value: number;
    solved: boolean;
    metric_direction: "lower_better" | "higher_better";
  }[];

  const names = new Map(rows.map((r) => [r.player_id, r.display_name]));
  const gameEntries: GameEntry[] = rows.map((r) => ({
    playerId: r.player_id,
    gameId: r.game_id,
    variant: r.variant,
    puzzleKey: r.puzzle_number != null ? `${r.game_id}|${r.puzzle_number}` : `${r.game_id}|${r.puzzle_date}`,
    value: r.parsed_value,
    solved: r.solved,
    direction: r.metric_direction,
  }));

  const players = tallyWins(gameEntries).map((w) => ({
    displayName: names.get(w.playerId) ?? w.playerId,
    wins: w.wins,
  }));
  return NextResponse.json({ players });
}
```

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS (all tests from Tasks 1–7).

- [ ] **Step 9: Commit**

```bash
git add src/lib/ids.ts src/lib/ids.test.ts src/app/api/
git commit -m "feat: auth, append-only entries, and leaderboard API routes"
```

---

### Task 8: Minimal UI — gate, entry, leaderboard

**Files:**
- Create: `src/app/page.tsx` (replace), `src/app/tracker.tsx`
- Modify: `src/app/page.tsx:1-5`

**Interfaces:**
- Consumes: `POST /api/auth`, `POST /api/entries`, `GET /api/leaderboard` (Task 7).
- Produces: the user-facing page. No exports consumed by other tasks.

- [ ] **Step 1: Implement the client component**

`src/app/tracker.tsx`:
```tsx
"use client";
import { useState, useEffect, useCallback } from "react";

type Row = { displayName: string; wins: number };

export function Tracker() {
  const [authed, setAuthed] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [message, setMessage] = useState("");
  const [board, setBoard] = useState<Row[]>([]);

  const loadBoard = useCallback(async () => {
    const res = await fetch("/api/leaderboard");
    if (res.ok) {
      const data = await res.json();
      setBoard(data.players);
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  async function submitPassphrase(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
    if (res.ok) {
      setAuthed(true);
      loadBoard();
    } else {
      setMessage("Wrong passphrase");
    }
  }

  async function submitScore(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, pin, rawInput }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage(`Saved: ${data.parsed.gameId} (${data.parsed.value})`);
      setRawInput("");
      loadBoard();
    } else {
      setMessage(data.error ?? "Error");
    }
  }

  if (!authed) {
    return (
      <form onSubmit={submitPassphrase}>
        <h1>Enter group passphrase</h1>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="passphrase"
        />
        <button type="submit">Enter</button>
        <p>{message}</p>
      </form>
    );
  }

  return (
    <main>
      <h1>Scoring Tracker</h1>
      <form onSubmit={submitScore}>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" />
        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder="Paste your result (e.g. Wordle 1,234 3/6)"
        />
        <button type="submit">Submit score</button>
      </form>
      <p>{message}</p>
      <h2>Today — Wins</h2>
      <table>
        <thead>
          <tr><th>Player</th><th>Wins</th></tr>
        </thead>
        <tbody>
          {board.map((r) => (
            <tr key={r.displayName}><td>{r.displayName}</td><td>{r.wins}</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 2: Wire the page to the component**

`src/app/page.tsx` (replace entire file):
```tsx
import { Tracker } from "./tracker";

export default function Home() {
  return <Tracker />;
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds (no type errors).

- [ ] **Step 4: Manual smoke test (documented, requires a Neon DB)**

1. Create a free Neon project; copy its pooled connection string into `.env.local` as `DATABASE_URL`. Set `AUTH_SECRET=$(openssl rand -hex 32)` in `.env.local`.
2. `npm run db:migrate`
3. `node scripts/seed.mjs`
4. `node scripts/set-passphrase.mjs friends123`
5. `npm run dev`, open `http://localhost:3000`.
6. Enter `friends123` → paste `Wordle 1,234 3/6` with a name + PIN → confirm it appears on the leaderboard with 1 win.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/tracker.tsx
git commit -m "feat: minimal UI for passphrase gate, score entry, and leaderboard"
```

---

## Self-Review

**Spec coverage (Plan 1 slice):**
- Hosted no-account app, single group → Tasks 1, 7 (auth), 8. ✅
- Passphrase + pick-name + PIN, server-side enforced, signed token → Tasks 3, 4, 7. ✅
- Paste-first entry with a parser → Tasks 5, 7, 8. ✅ (manual fallback + full parser set → Plan 2.)
- Wins-based leaderboard → Tasks 6, 7, 8. ✅ (sortable multi-metric + windows + streaks → Plan 3.)
- Append-only entries / audit trail → Task 7 (supersede + version). ✅
- `group_id` on every table, pooled DB connection → Tasks 2, 7. ✅
- Free-tier stack, Node runtime → Global Constraints, Task 8 smoke test. ✅
- Deferred by design (not gaps): manual fallback, full parsers, difficulty variants in UI, daily-lock/no-peek, late-entry exclusion logic, time windows, streaks, per-game boards, admin, parse-failure logging → Plans 2–4. The `is_late`, `variant`, `puzzle_number`, and `version` columns exist now so those plans need no migration.

**Placeholder scan:** No TBD/TODO/"handle appropriately". The `seed.mjs` `REPLACE_ME` passphrase hash is intentional and overwritten by `set-passphrase.mjs` (Task 3 Step 5, run in Task 8 smoke test). ✅

**Type consistency:** `ParseResult`/`Parser` (Task 5) consumed unchanged by Task 7. `GameEntry`/`tallyWins` (Task 6) consumed unchanged by the leaderboard route (Task 7). `sql` (Task 2), `hashSecret`/`verifySecret` (Task 3), `issueGroupToken`/`verifyGroupToken` (Task 4) used with matching signatures in Task 7. `newId(prefix)` defined and used in Task 7. ✅
