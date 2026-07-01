# Scoring Tracker — Plan 4: In-App Admin + Per-Game Daily No-Peek

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a trusted admin add games and rename players from the app (gated by a separate admin passphrase), and add a per-game "no-peek" lock so a player can't see today's results for a game until they've played it themselves.

**Architecture:** A new `admin_passphrase_hash` column on `groups` gates admin write endpoints (verified server-side per request, reusing the existing scrypt `verifySecret`). A pure `validateNewGame` guards game creation. No-peek is a pure decision layer (`isDailyBoardLocked`, `visibleTodayEntries`) wired into the two existing read routes: they now take a `player` name and, for the **daily** window only, restrict the overall board to games that player has played today and lock a per-game board until the player has played that game today. Historical windows (weekly/monthly/all) are unaffected.

**Tech Stack:** Same as Plans 1–3. No new dependencies.

## Global Constraints

- **Pure functions** (`src/scoring/*`, `src/lib/*`): deterministic, no DB/env/I/O/`Date.now()` — "today" is a passed-in `YYYY-MM-DD` string.
- **Reuse:** `hashSecret`/`verifySecret` (`src/auth/hash.ts`), `computeOverall`/`computeGameBoard`, `localDateInTz`, `windowStart`. Do not fork them.
- **No-peek applies to the `daily` window only.** Weekly/monthly/all-time boards are always fully visible. The viewer is identified by a `player` display-name query param (no PIN required for reads — honor-system, consistent with the design's "cheap guards"). A viewer with no name, or who hasn't played, sees an empty/locked daily view.
- **No-peek definition:** the set of "games the viewer has played today" = games for which the viewer has an on-time active entry with `puzzle_date = today`. Daily overall standings are computed over only those games; a per-game daily board for game X is locked unless X is in that set.
- **Admin auth:** admin endpoints require BOTH a valid group token (cookie) AND a correct `adminPassphrase` in the request body, verified server-side with `verifySecret` against `groups.admin_passphrase_hash`. A missing/incorrect admin passphrase → 403. If no admin passphrase has been set for the group, all admin actions are refused (403).
- **Node runtime** on routes; auth before any data mutation; parameterized SQL; no `dangerouslySetInnerHTML`; append-only entries untouched — all per Plans 1–3.
- **TDD:** every code task is failing test → run (fail) → minimal impl → run (pass) → commit. Pure modules fully unit-tested; route/UI/DDL wiring verified by `npm run build` + the live smoke test (Task 8).

---

### Task 1: Admin passphrase — schema column + CLI

**Files:**
- Modify: `src/db/schema.sql`
- Create: `scripts/set-admin-passphrase.mjs`

**Interfaces:**
- Consumes: nothing (ops).
- Produces: an `admin_passphrase_hash TEXT` column on `groups` (nullable), and a CLI to set it. Consumed by the admin API (Task 3).

- [ ] **Step 1: Add the column to the schema (fresh + existing DBs)**

In `src/db/schema.sql`, add `admin_passphrase_hash TEXT` to the `groups` CREATE (for fresh DBs), and add an idempotent ALTER immediately after the `groups` table block (for existing DBs). The groups block becomes:
```sql
CREATE TABLE IF NOT EXISTS groups (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  passphrase_hash TEXT NOT NULL,
  admin_passphrase_hash TEXT,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE groups ADD COLUMN IF NOT EXISTS admin_passphrase_hash TEXT;
```
(The `migrate.mjs` runner splits on `;` and runs each statement; `ADD COLUMN IF NOT EXISTS` is idempotent.)

- [ ] **Step 2: Create the CLI**

`scripts/set-admin-passphrase.mjs`:
```js
import { neon } from "@neondatabase/serverless";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const sql = neon(process.env.DATABASE_URL);
const passphrase = process.argv[2];
if (!passphrase) {
  console.error("Usage: node scripts/set-admin-passphrase.mjs <passphrase>");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
const key = (await scryptAsync(passphrase, salt, 64)).toString("hex");
await sql`UPDATE groups SET admin_passphrase_hash = ${`${salt}:${key}`} WHERE id = 'g1'`;
console.log("Admin passphrase set for group g1.");
```

- [ ] **Step 3: Apply against the live DB**

Run:
```bash
set -a && . ./.env.local && set +a
node scripts/migrate.mjs
node scripts/set-admin-passphrase.mjs admin123
```
Expected: migration completes; "Admin passphrase set for group g1."

- [ ] **Step 4: Verify the column exists**

Run:
```bash
set -a && . ./.env.local && set +a && node --input-type=module -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const r = await sql(\"SELECT admin_passphrase_hash IS NOT NULL AS has_admin FROM groups WHERE id='g1'\");
console.log('admin passphrase set:', r[0].has_admin);
"
```
Expected: `admin passphrase set: true`.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.sql scripts/set-admin-passphrase.mjs
git commit -m "feat: admin_passphrase_hash column and set-admin-passphrase CLI"
```

---

### Task 2: `validateNewGame` (pure)

**Files:**
- Create: `src/lib/validateGame.ts`
- Test: `src/lib/validateGame.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ValidGame = { id: string; name: string; type: "outcome" | "timed"; metricDirection: "lower_better" | "higher_better"; hasVariants: boolean; parserId: string | null }`.
  - `validateNewGame(input: unknown): ValidGame | { error: string }` — validates and normalizes admin game input. `id` must be a non-empty slug (`^[a-z0-9-]+$`); `name` non-empty; `type`/`metricDirection` in their enums; `hasVariants` boolean (default false); `parserId` a non-empty string or null (default null). Consumed by the admin API (Task 3).

- [ ] **Step 1: Write the failing test**

`src/lib/validateGame.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateNewGame } from "./validateGame";

describe("validateNewGame", () => {
  it("accepts and normalizes a valid game", () => {
    expect(validateNewGame({
      id: "strands", name: "Strands", type: "outcome",
      metricDirection: "lower_better", hasVariants: false,
    })).toEqual({
      id: "strands", name: "Strands", type: "outcome",
      metricDirection: "lower_better", hasVariants: false, parserId: null,
    });
  });
  it("defaults hasVariants to false and parserId to null", () => {
    const r = validateNewGame({ id: "zip", name: "Zip", type: "timed", metricDirection: "lower_better" });
    expect(r).toEqual({
      id: "zip", name: "Zip", type: "timed", metricDirection: "lower_better",
      hasVariants: false, parserId: null,
    });
  });
  it("rejects a bad id", () => {
    expect(validateNewGame({ id: "Bad ID!", name: "X", type: "timed", metricDirection: "lower_better" }))
      .toEqual({ error: "Invalid game id (use lowercase letters, digits, hyphens)" });
  });
  it("rejects an unknown type", () => {
    expect(validateNewGame({ id: "x", name: "X", type: "score", metricDirection: "lower_better" }))
      .toEqual({ error: "Invalid type" });
  });
  it("rejects an unknown metricDirection", () => {
    expect(validateNewGame({ id: "x", name: "X", type: "timed", metricDirection: "fastest" }))
      .toEqual({ error: "Invalid metricDirection" });
  });
  it("rejects a missing name", () => {
    expect(validateNewGame({ id: "x", name: "", type: "timed", metricDirection: "lower_better" }))
      .toEqual({ error: "Name is required" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- validateGame`
Expected: FAIL — cannot find module `./validateGame`.

- [ ] **Step 3: Implement**

`src/lib/validateGame.ts`:
```ts
export interface ValidGame {
  id: string;
  name: string;
  type: "outcome" | "timed";
  metricDirection: "lower_better" | "higher_better";
  hasVariants: boolean;
  parserId: string | null;
}

export function validateNewGame(input: unknown): ValidGame | { error: string } {
  const b = (input ?? {}) as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id.trim() : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";

  if (!/^[a-z0-9-]+$/.test(id)) {
    return { error: "Invalid game id (use lowercase letters, digits, hyphens)" };
  }
  if (name.length === 0) return { error: "Name is required" };
  if (b.type !== "outcome" && b.type !== "timed") return { error: "Invalid type" };
  if (b.metricDirection !== "lower_better" && b.metricDirection !== "higher_better") {
    return { error: "Invalid metricDirection" };
  }

  const parserId =
    typeof b.parserId === "string" && b.parserId.trim().length > 0 ? b.parserId.trim() : null;

  return {
    id,
    name,
    type: b.type,
    metricDirection: b.metricDirection,
    hasVariants: b.hasVariants === true,
    parserId,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- validateGame`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validateGame.ts src/lib/validateGame.test.ts
git commit -m "feat: validateNewGame pure validator for admin game creation"
```

---

### Task 3: Admin API — create game, list + rename players

**Files:**
- Create: `src/lib/adminAuth.ts`, `src/app/api/admin/games/route.ts`, `src/app/api/admin/players/rename/route.ts`, `src/app/api/players/route.ts`

**Interfaces:**
- Consumes: `validateNewGame` (Task 2), `sql`, `verifyGroupToken`, `verifySecret`, `newId`.
- Produces:
  - `requireAdmin(body: Record<string, unknown>): Promise<{ groupId: string } | { error: string; status: number }>` in `src/lib/adminAuth.ts` — checks the group cookie AND `body.adminPassphrase` against `groups.admin_passphrase_hash`.
  - `POST /api/admin/games` — body `{ adminPassphrase, id, name, type, metricDirection, hasVariants?, parserId? }` → creates the game; 409 if id exists; 422 on validation error.
  - `POST /api/admin/players/rename` — body `{ adminPassphrase, playerId, newName }` → renames; 409 on name clash; 404 if player not in group.
  - `GET /api/players` — group-auth only → `{ players: { id, displayName }[] }`.

- [ ] **Step 1: Implement the admin-auth helper**

`src/lib/adminAuth.ts`:
```ts
import { cookies } from "next/headers";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";
import { verifySecret } from "@/auth/hash";

export async function requireAdmin(
  body: Record<string, unknown>,
): Promise<{ groupId: string } | { error: string; status: number }> {
  const token = cookies().get("group_token")?.value;
  const payload = token ? await verifyGroupToken(token) : null;
  if (!payload) return { error: "Unauthorized", status: 401 };

  const adminPassphrase = body.adminPassphrase;
  if (typeof adminPassphrase !== "string" || adminPassphrase.length === 0) {
    return { error: "Admin passphrase required", status: 403 };
  }
  const rows = (await sql`
    SELECT admin_passphrase_hash FROM groups WHERE id = ${payload.groupId}
  `) as { admin_passphrase_hash: string | null }[];
  const hash = rows[0]?.admin_passphrase_hash;
  if (!hash || !(await verifySecret(adminPassphrase, hash))) {
    return { error: "Wrong admin passphrase", status: 403 };
  }
  return { groupId: payload.groupId };
}
```

- [ ] **Step 2: Implement the create-game route**

`src/app/api/admin/games/route.ts`:
```ts
import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireAdmin } from "@/lib/adminAuth";
import { validateNewGame } from "@/lib/validateGame";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = await requireAdmin(body);
  if ("error" in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const game = validateNewGame(body);
  if ("error" in game) return NextResponse.json({ error: game.error }, { status: 422 });

  const existing = (await sql`
    SELECT id FROM games WHERE id = ${game.id} AND group_id = ${admin.groupId}
  `) as { id: string }[];
  if (existing[0]) return NextResponse.json({ error: "Game id already exists" }, { status: 409 });

  await sql`
    INSERT INTO games (id, group_id, name, type, metric_direction, parser_id, has_variants)
    VALUES (${game.id}, ${admin.groupId}, ${game.name}, ${game.type}, ${game.metricDirection},
      ${game.parserId}, ${game.hasVariants})
  `;
  return NextResponse.json({ ok: true, game });
}
```

- [ ] **Step 3: Implement the rename-player route**

`src/app/api/admin/players/rename/route.ts`:
```ts
import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = await requireAdmin(body);
  if ("error" in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const { playerId, newName } = body as { playerId?: string; newName?: string };
  if (typeof playerId !== "string" || typeof newName !== "string" || newName.trim().length === 0) {
    return NextResponse.json({ error: "playerId and newName required" }, { status: 400 });
  }
  const name = newName.trim();

  const player = (await sql`
    SELECT id FROM players WHERE id = ${playerId} AND group_id = ${admin.groupId}
  `) as { id: string }[];
  if (!player[0]) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  const clash = (await sql`
    SELECT id FROM players WHERE group_id = ${admin.groupId} AND display_name = ${name} AND id <> ${playerId}
  `) as { id: string }[];
  if (clash[0]) return NextResponse.json({ error: "Name already taken" }, { status: 409 });

  await sql`UPDATE players SET display_name = ${name} WHERE id = ${playerId}`;
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Implement the players-list route**

`src/app/api/players/route.ts`:
```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";

export const runtime = "nodejs";

export async function GET() {
  const token = cookies().get("group_token")?.value;
  const payload = token ? await verifyGroupToken(token) : null;
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = (await sql`
    SELECT id, display_name FROM players WHERE group_id = ${payload.groupId} ORDER BY display_name
  `) as { id: string; display_name: string }[];
  return NextResponse.json({ players: rows.map((r) => ({ id: r.id, displayName: r.display_name })) });
}
```

- [ ] **Step 5: Verify the build compiles**

Run: `DATABASE_URL='postgres://u:p@localhost/db' AUTH_SECRET='x-at-least-32-bytes-xxxxxxxxxxxxxx' npm run build`
Expected: compiles; `/api/admin/games`, `/api/admin/players/rename`, `/api/players` listed as dynamic routes.

- [ ] **Step 6: Run the full unit suite**

Run: `npm test`
Expected: PASS (all prior + Task 2's new tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/adminAuth.ts src/app/api/admin/ src/app/api/players/
git commit -m "feat: admin API (create game, rename player), players list, admin auth"
```

---

### Task 4: No-peek pure helpers

**Files:**
- Create: `src/scoring/noPeek.ts`
- Test: `src/scoring/noPeek.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isDailyBoardLocked(window: string, hasPlayedGameToday: boolean): boolean` — true iff `window === "daily"` and the game hasn't been played today by the viewer.
  - `visibleTodayEntries<T extends { gameId: string }>(entries: T[], playedGameIds: Set<string>): T[]` — keeps only entries whose `gameId` is in the played set.
  Used by the read routes (Tasks 5–6).

- [ ] **Step 1: Write the failing test**

`src/scoring/noPeek.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isDailyBoardLocked, visibleTodayEntries } from "./noPeek";

describe("isDailyBoardLocked", () => {
  it("locks the daily board for a game not played today", () => {
    expect(isDailyBoardLocked("daily", false)).toBe(true);
  });
  it("unlocks the daily board once the game is played today", () => {
    expect(isDailyBoardLocked("daily", true)).toBe(false);
  });
  it("never locks non-daily windows", () => {
    expect(isDailyBoardLocked("weekly", false)).toBe(false);
    expect(isDailyBoardLocked("all", false)).toBe(false);
  });
});

describe("visibleTodayEntries", () => {
  it("keeps only entries for played games", () => {
    const entries = [{ gameId: "wordle" }, { gameId: "pips" }, { gameId: "queens" }];
    expect(visibleTodayEntries(entries, new Set(["wordle", "queens"]))).toEqual([
      { gameId: "wordle" }, { gameId: "queens" },
    ]);
  });
  it("returns nothing when the played set is empty", () => {
    expect(visibleTodayEntries([{ gameId: "wordle" }], new Set())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- noPeek`
Expected: FAIL — cannot find module `./noPeek`.

- [ ] **Step 3: Implement**

`src/scoring/noPeek.ts`:
```ts
export function isDailyBoardLocked(window: string, hasPlayedGameToday: boolean): boolean {
  return window === "daily" && !hasPlayedGameToday;
}

export function visibleTodayEntries<T extends { gameId: string }>(
  entries: T[],
  playedGameIds: Set<string>,
): T[] {
  return entries.filter((e) => playedGameIds.has(e.gameId));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- noPeek`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scoring/noPeek.ts src/scoring/noPeek.test.ts
git commit -m "feat: no-peek pure helpers (daily lock + visible-today filter)"
```

---

### Task 5: Wire no-peek into the overall leaderboard route

**Files:**
- Modify: `src/app/api/leaderboard/route.ts`

**Interfaces:**
- Consumes: `visibleTodayEntries` (Task 4), plus existing pieces.
- Produces: `GET /api/leaderboard?window=…&player=<displayName>` — unchanged for non-daily windows; for `daily`, the standings are computed over only the games the named player has an on-time entry for today. Response gains `locked: boolean` (true when `window === "daily"` and the player has played nothing today). Player param optional; absent → treated as "played nothing".

- [ ] **Step 1: Update the route to filter the daily window by the viewer's played games**

In `src/app/api/leaderboard/route.ts`, after building `rows` and before building `gameEntries`, read the `player` param and, for the daily window, compute the played set and filter. Replace the section from reading the window param through building `gameEntries` so it reads the `player` param and applies the filter. Concretely:

Add near the other param reads:
```ts
  const viewer = new URL(req.url).searchParams.get("player") ?? "";
```

Then, after `rows` is fetched, compute the daily visibility and filter:
```ts
  // No-peek: for the daily window, only reveal games the viewer has played today.
  let visibleRows = rows;
  let locked = false;
  if (window === "daily") {
    const playedGameIds = new Set(
      rows.filter((r) => r.display_name === viewer).map((r) => r.game_id),
    );
    locked = playedGameIds.size === 0;
    visibleRows = rows.filter((r) => playedGameIds.has(r.game_id));
  }
```
Build `gameEntries` from `visibleRows` (not `rows`), and return `locked` in the response:
```ts
  const names = new Map(visibleRows.map((r) => [r.player_id, r.display_name]));
  const gameEntries: GameEntry[] = visibleRows.map((r) => ({
    playerId: r.player_id,
    gameId: r.game_id,
    variant: r.variant,
    puzzleKey: `${r.game_id}|${r.puzzle_date}`,
    value: r.parsed_value,
    solved: r.solved,
    direction: r.metric_direction,
  }));

  const players = computeOverall(gameEntries).map((s) => ({
    displayName: names.get(s.playerId) ?? s.playerId,
    wins: s.wins,
    gamesPlayed: s.gamesPlayed,
    winRate: s.winRate,
  }));
  return NextResponse.json({ window, locked, players });
```
(The SQL query, auth, and non-daily behavior are unchanged. Import is not required — this uses inline filtering identical in spirit to `visibleTodayEntries`; keep the inline version to avoid mapping the row type into the generic. Do NOT change the `<= today` / on-time filters.)

- [ ] **Step 2: Verify the build compiles**

Run: `DATABASE_URL='postgres://u:p@localhost/db' AUTH_SECRET='x-at-least-32-bytes-xxxxxxxxxxxxxx' npm run build`
Expected: compiles with no type errors.

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/leaderboard/route.ts
git commit -m "feat: daily no-peek on overall board (viewer's played games only)"
```

---

### Task 6: Wire no-peek into the per-game board route

**Files:**
- Modify: `src/app/api/games/[gameId]/board/route.ts`

**Interfaces:**
- Consumes: `isDailyBoardLocked` (Task 4).
- Produces: `GET /api/games/<gameId>/board?window=…&player=<displayName>` — for `window === "daily"`, if the named player has no on-time entry for this game today, returns `{ gameId, window, locked: true, players: [] }`. Otherwise (and for all non-daily windows) returns the board as before plus `locked: false`.

- [ ] **Step 1: Update the route to lock the daily board until the viewer has played**

In `src/app/api/games/[gameId]/board/route.ts`:

Add the viewer param read (near the window read):
```ts
  const viewer = new URL(req.url).searchParams.get("player") ?? "";
```
After `rows` are fetched and `today` is known, compute whether the viewer played this game today, and short-circuit if locked:
```ts
  import { isDailyBoardLocked } from "@/scoring/noPeek"; // add to the top imports

  const playedToday = rows.some(
    (r) => r.display_name === viewer && r.puzzle_date === today,
  );
  if (isDailyBoardLocked(window, playedToday)) {
    return NextResponse.json({ gameId, window, locked: true, players: [] });
  }
```
(Place the `playedToday`/lock check AFTER `rows` and `today` are computed but BEFORE building `entries`/calling `computeGameBoard`. Add `locked: false` to the existing success response. `r.display_name` and `r.puzzle_date` are already selected in the query — confirm both are in the SELECT; `puzzle_date` is cast to text per Plan 3. Move the `import` to the top of the file with the other imports rather than inline.)

- [ ] **Step 2: Verify the build compiles**

Run: `DATABASE_URL='postgres://u:p@localhost/db' AUTH_SECRET='x-at-least-32-bytes-xxxxxxxxxxxxxx' npm run build`
Expected: compiles with no type errors.

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/games/[gameId]/board/route.ts"
git commit -m "feat: daily no-peek lock on per-game board until viewer plays"
```

---

### Task 7: UI — admin panel + no-peek wiring

**Files:**
- Modify: `src/app/tracker.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/games`, `POST /api/admin/players/rename`, `GET /api/players`, and the updated read routes (`?player=`).
- Produces: user-facing admin panel + no-peek behavior. No exports.

Behavior:
- Pass the current `displayName` as `&player=<name>` on every leaderboard and per-game board fetch.
- When the overall daily response has `locked: true` (or the per-game board has `locked: true`), show a clear "Play today's puzzles to reveal today's board" message instead of (or above) the empty table.
- Add an **Admin** section: an admin-passphrase input (component state only), an "Add game" form (id, name, type select, metricDirection select, hasVariants checkbox, optional parserId), and a players list (from `GET /api/players`) each with a rename input. Admin actions send `adminPassphrase` in the body and surface server errors.

- [ ] **Step 1: Update the tracker component**

Make these focused edits to `src/app/tracker.tsx` (keep all existing behavior from Plan 3):

(a) Thread `displayName` into the read fetches:
```tsx
  const loadOverall = useCallback(async (w: Window) => {
    try {
      const res = await fetch(`/api/leaderboard?window=${w}&player=${encodeURIComponent(displayName)}`);
      if (res.ok) { const d = await res.json(); setOverall(d.players); setOverallLocked(!!d.locked); markAuthed(); return; }
      if (res.status === 401) return;
      if (authedRef.current) setMessage("Couldn't refresh the leaderboard — try again.");
    } catch { if (authedRef.current) setMessage("Couldn't refresh the leaderboard — try again."); }
  }, [displayName]);

  const loadGameBoard = useCallback(async (g: string, w: Window) => {
    if (!g) return;
    const res = await fetch(`/api/games/${g}/board?window=${w}&player=${encodeURIComponent(displayName)}`);
    if (res.ok) { const d = await res.json(); setGameBoard(d.players); setBoardLocked(!!d.locked); }
  }, [displayName]);
```
Add state: `const [overallLocked, setOverallLocked] = useState(false);` and `const [boardLocked, setBoardLocked] = useState(false);`. Add admin state:
```tsx
  const [adminPass, setAdminPass] = useState("");
  const [players, setPlayers] = useState<{ id: string; displayName: string }[]>([]);
  const [ng, setNg] = useState({ id: "", name: "", type: "timed", metricDirection: "lower_better", hasVariants: false, parserId: "" });
```

(b) Load the player list after auth (for the rename UI):
```tsx
  const loadPlayers = useCallback(async () => {
    const res = await fetch("/api/players");
    if (res.ok) setPlayers((await res.json()).players);
  }, []);
  useEffect(() => { if (authed) loadPlayers(); }, [authed, loadPlayers]);
```

(c) Admin actions:
```tsx
  async function addGame(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/games", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminPassphrase: adminPass, ...ng }),
    });
    const d = await res.json().catch(() => ({}));
    setMessage(res.ok ? `Added game: ${d.game?.name}` : (d.error ?? "Add game failed"));
    if (res.ok) { setNg({ id: "", name: "", type: "timed", metricDirection: "lower_better", hasVariants: false, parserId: "" }); loadGames(); }
  }
  async function renamePlayer(playerId: string, newName: string) {
    const res = await fetch("/api/admin/players/rename", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminPassphrase: adminPass, playerId, newName }),
    });
    const d = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Renamed" : (d.error ?? "Rename failed"));
    if (res.ok) { loadPlayers(); loadOverall(window); }
  }
```

(d) In the Leaderboard section, when `overallLocked` show a notice; likewise `boardLocked` in the per-game section:
```tsx
        {overallLocked
          ? <p>Play today&apos;s puzzles to reveal today&apos;s leaderboard.</p>
          : (/* existing overall <table> */ null)}
```
```tsx
        {boardLocked
          ? <p>Play today&apos;s game to see today&apos;s board.</p>
          : (/* existing per-game <table> */ null)}
```
(Render the existing tables in the non-locked branch; keep them intact.)

(e) Add the Admin section near the end of the authed view:
```tsx
      <section>
        <h2>Admin</h2>
        <input type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} placeholder="admin passphrase" />
        <h3>Add a game</h3>
        <form onSubmit={addGame}>
          <input value={ng.id} onChange={(e) => setNg({ ...ng, id: e.target.value })} placeholder="id (e.g. strands)" />
          <input value={ng.name} onChange={(e) => setNg({ ...ng, name: e.target.value })} placeholder="Name" />
          <select value={ng.type} onChange={(e) => setNg({ ...ng, type: e.target.value })}>
            <option value="timed">timed</option><option value="outcome">outcome</option>
          </select>
          <select value={ng.metricDirection} onChange={(e) => setNg({ ...ng, metricDirection: e.target.value })}>
            <option value="lower_better">lower is better</option><option value="higher_better">higher is better</option>
          </select>
          <label><input type="checkbox" checked={ng.hasVariants} onChange={(e) => setNg({ ...ng, hasVariants: e.target.checked })} /> has difficulties</label>
          <input value={ng.parserId} onChange={(e) => setNg({ ...ng, parserId: e.target.value })} placeholder="parserId (optional)" />
          <button type="submit">Add game</button>
        </form>
        <h3>Players</h3>
        <ul>
          {players.map((p) => (
            <li key={p.id}>
              <RenameRow player={p} onRename={renamePlayer} />
            </li>
          ))}
        </ul>
      </section>
```
Add a small local component (above `Tracker` or inside the file):
```tsx
function RenameRow({ player, onRename }: { player: { id: string; displayName: string }; onRename: (id: string, name: string) => void }) {
  const [name, setName] = useState(player.displayName);
  return (
    <>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button onClick={() => onRename(player.id, name)}>Rename</button>
    </>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `DATABASE_URL='postgres://u:p@localhost/db' AUTH_SECRET='x-at-least-32-bytes-xxxxxxxxxxxxxx' npm run build`
Expected: compiles with no type errors.

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/tracker.tsx
git commit -m "feat: admin panel (add game, rename player) and no-peek UI"
```

---

### Task 8: Live smoke test (documented; requires Neon)

**Files:** none.

- [ ] **Step 1: Ensure DB is current (admin column + passphrase)**

```bash
set -a && . ./.env.local && set +a
node scripts/migrate.mjs
node scripts/set-admin-passphrase.mjs admin123
```

- [ ] **Step 2: Exercise admin**

Auth to get the cookie, then:
- `POST /api/admin/games` with wrong `adminPassphrase` → 403.
- `POST /api/admin/games` `{adminPassphrase:"admin123", id:"framed", name:"Framed", type:"outcome", metricDirection:"lower_better"}` → 200; then `GET /api/games` includes `framed`.
- `POST /api/admin/games` same id again → 409.
- `GET /api/players` → list; `POST /api/admin/players/rename` `{adminPassphrase:"admin123", playerId:<one>, newName:"NewName"}` → 200; list reflects it; a name clash → 409.

- [ ] **Step 3: Exercise no-peek**

- As a player who has NOT logged anything today: `GET /api/leaderboard?window=daily&player=Nobody` → `locked:true`, empty players; `GET /api/games/wordle/board?window=daily&player=Nobody` → `locked:true`.
- Submit today's Wordle for player "Peeker", then `GET /api/games/wordle/board?window=daily&player=Peeker` → `locked:false` with data; `GET /api/games/pips/board?window=daily&player=Peeker` → still `locked:true` (hasn't played Pips today).
- `GET /api/leaderboard?window=all&player=Nobody` → NOT locked (historical always visible).

Expected: all behaviors as described.

- [ ] **Step 4: (optional) clear test data** — same snippet as prior plans.

---

## Self-Review

**Spec coverage (design spec §7 integrity + configurable-games goal):**
- Separate admin passphrase gating admin actions → Tasks 1, 3. ✅
- Add a game in-app (configurable games without redeploy) → Tasks 2, 3, 7. ✅
- Manage players (list + rename) → Tasks 3, 7. ✅
- Daily no-peek, per-game, viewer-scoped → Tasks 4, 5, 6, 7. ✅
- Deferred (by scope decision): late-entry/backfill; player removal (FK/audit). Not gaps.

**Placeholder scan:** No TBD/TODO; every code step has complete code or a precise, self-contained edit description with the exact code to insert. Task 5/6 describe targeted edits to existing files (the surrounding files are given in Plan 3 and unchanged); the inserted code is complete. ✅

**Type consistency:** `ValidGame`/`validateNewGame` (Task 2) consumed by the admin route (Task 3). `requireAdmin` returns `{groupId} | {error,status}` and is narrowed via `"error" in admin` in both admin routes. `isDailyBoardLocked`/`visibleTodayEntries` (Task 4) used in Tasks 5/6 (leaderboard uses inline filtering of the same shape; per-game uses `isDailyBoardLocked`). Read responses gain `locked: boolean`, consumed by the UI (`overallLocked`/`boardLocked`) in Task 7. Admin request bodies (`adminPassphrase` + fields) match `requireAdmin` + `validateNewGame` + the rename route contract. `GET /api/players` returns `{id, displayName}` matching the UI `players` state and `RenameRow` props. ✅
