# Multi-Group Phase 1 — Foundation Reshape + g1→Global Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Bragboard's identity and results onto the *person* (global model) and dissolve the single `g1` group into "the global board," with no change to what the user sees — the app still shows one global board, but on the new data model that Phase 2's group features build on.

**Architecture:** Additive-then-cutover migration on the live Neon Postgres. Display name moves from `players` to `users`; `entries` gain a `user_id` and are queried by it (joining `users` for the name instead of `players`); games become a global catalog (drop the `group_id` filter); `resolveViewer` redefines "member" as *any authenticated user with a display name*; a single platform timezone replaces `groups.timezone`; admin splits into a platform `requireSuperAdmin` (the owner) — group-level admin arrives in Phase 2. The scoring layer is untouched (it groups by whatever id key it's handed; we hand it `user_id`).

**Tech Stack:** Next.js 14.2 App Router, TypeScript, Neon Postgres (`@neondatabase/serverless` HTTP driver — stateless, NO interactive transactions), Auth.js v5, Vitest (+ jsdom for components).

## Global Constraints

- **Stateless DB driver:** no interactive transactions and no `FOR UPDATE`. Concurrency correctness comes from **partial UNIQUE indexes + catching Postgres error `23505`** (see `src/lib/claims.ts` `isUniqueViolation` for the exact pattern), never check-then-write.
- **Migrations** are applied by `scripts/migrate.mjs`, which splits `src/db/schema.sql` on `;` — **never put a `;` inside a SQL comment.** Every DDL statement uses `IF NOT EXISTS` / `IF EXISTS` so re-running is safe.
- **DB is the source of truth** for identity/membership; the JWT carries only `userId`. Never trust a client-supplied id/name for identity.
- **Global display-name uniqueness** is case-insensitive; collisions surface as a clean `409`, never a raw 500.
- **CI must stay green and the build secret-free.** `npm run typecheck && npm run lint && npm test && npm run build` all pass; no secrets in code.
- **No production merge or prod DB change without the owner's explicit go-ahead.** Before any prod migration/cutover deploy, create a backup branch + annotated tag on `origin/main` HEAD and push both (see "Deploy gates").
- **Platform timezone** is `Asia/Kolkata` (unchanged from `g1.timezone` today — this is a code move, not a behavior change).
- **Branch:** all work on `feat/multi-group-phase1` (off `main`). Never commit to `main` directly.

## Deploy gates (guided, controller-run — NOT code tasks)

These are performed by the controller with explicit owner go-ahead, interleaved with the code tasks — they are called out here so they are not forgotten:

- **G0 (before applying any DDL to preview):** confirm the branch's schema applies cleanly to the **preview** Neon branch via `scripts/migrate.mjs`.
- **G1 (before the backfill/cutover on prod):** create `backup/pre-multigroup-2026-07-04` branch + annotated tag `pre-multigroup` on `origin/main` HEAD; push both. Verify zero case-insensitive name collisions among live users (Task 11's gate) BEFORE creating the global-name unique index on prod.
- **G2 (cutover):** apply the backfill script to prod, verify counts, then deploy. The destructive cleanup (Task 12: dropping `g1` rows and legacy columns) runs **only after** the new code is confirmed live and healthy on prod.

---

## File structure

**Schema**
- `src/db/schema.sql` — additive columns/indexes (Tasks 1, 4, 11); destructive drops (Task 12).

**Library**
- `src/lib/group.ts` — replace `GROUP_ID` with `PLATFORM_TZ` (Task 9); `GROUP_ID` retired from runtime use.
- `src/lib/membership.ts` — `resolveViewer` reshaped to global identity; `requireSuperAdmin` added (Tasks 2, 3).
- `src/lib/identity.ts` — **new**: `createUserProfile` / global name-clash helper reused by rename + future onboarding (Task 1).

**Routes (rewritten to user-scoped, global reads)**
- `src/app/api/entries/route.ts` (Task 4)
- `src/app/api/leaderboard/route.ts` (Task 5)
- `src/app/api/me/route.ts` (Task 6)
- `src/app/api/games/[gameId]/board/route.ts` (Task 7)
- `src/app/api/games/route.ts`, `src/app/api/players/route.ts` (Task 8)
- `src/app/api/me/rename/route.ts` (Task 10); `src/app/api/admin/players/rename/route.ts` retired (Task 10)
- `src/app/api/admin/games/route.ts` — `requireSuperAdmin` (Task 3)

**Scripts**
- `scripts/migrate.mjs` — unchanged (applies schema.sql).
- `scripts/backfill-phase1.mjs` — **new**: backfill + verification (Task 11).

**Onboarding note:** `src/lib/claims.ts` `createFreshPlayer` and `src/app/api/onboarding/route.ts` currently write `players.display_name`. Phase 1 keeps a `players` row per user as the *membership-to-g1 shim* until Task 12; onboarding continues to create a player, and Task 1 also writes the name to `users.display_name`. Full removal of the player-creation path is Phase 2 (memberships). This keeps Phase 1 shippable without rewriting onboarding.

---

## Task 1: `users` identity columns + `lib/identity.ts` global name helper

**Files:**
- Modify: `src/db/schema.sql` (append additive columns)
- Create: `src/lib/identity.ts`
- Test: `src/lib/identity.test.ts`

**Interfaces:**
- Produces: `nameClashExists(name: string, excludeUserId?: string): Promise<boolean>` and `setDisplayName(userId: string, name: string): Promise<{ ok: true } | { ok: false; reason: "name-taken" }>` — used by Task 10 (rename) and later onboarding.

- [ ] **Step 1: Add the additive schema (no `;` inside comments)**

Append to `src/db/schema.sql`:
```sql
-- === Global identity (Phase 1 multi-group) — display name + platform super-admin ===
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
ALTER TABLE groups ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id);
```
(The global-name unique index is created in Task 11, only after backfill + the collision gate.)

- [ ] **Step 2: Write the failing test**

`src/lib/identity.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = vi.fn();
vi.mock("@/db/client", () => ({ sql: sqlMock }));

const { nameClashExists, setDisplayName } = await import("./identity");

beforeEach(() => vi.clearAllMocks());

describe("nameClashExists", () => {
  it("is true when another user holds the name (case-insensitive)", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "u2" }]);
    expect(await nameClashExists("Abeer")).toBe(true);
  });
  it("is false when no row matches", async () => {
    sqlMock.mockResolvedValueOnce([]);
    expect(await nameClashExists("Zaphod")).toBe(false);
  });
});

describe("setDisplayName", () => {
  it("returns name-taken on a clash without updating", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "u2" }]); // clash check
    const r = await setDisplayName("u1", "Abeer");
    expect(r).toEqual({ ok: false, reason: "name-taken" });
    expect(sqlMock).toHaveBeenCalledTimes(1); // no UPDATE
  });
  it("updates and returns ok when free", async () => {
    sqlMock.mockResolvedValueOnce([]); // clash check
    sqlMock.mockResolvedValueOnce([]); // update
    const r = await setDisplayName("u1", "Zaphod");
    expect(r).toEqual({ ok: true });
  });
  it("maps a 23505 on the unique index to name-taken (race backstop)", async () => {
    sqlMock.mockResolvedValueOnce([]); // clash check passes
    sqlMock.mockRejectedValueOnce({ code: "23505", constraint: "users_display_name_lower_uq" });
    const r = await setDisplayName("u1", "Zaphod");
    expect(r).toEqual({ ok: false, reason: "name-taken" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/lib/identity.test.ts`
Expected: FAIL (`Cannot find module './identity'`).

- [ ] **Step 4: Implement `src/lib/identity.ts`**

```ts
import { sql } from "@/db/client";

interface NeonDbErrorLike { code?: string; constraint?: string }
function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as NeonDbErrorLike | undefined;
  return !!e && e.code === "23505" && e.constraint === constraint;
}

/** True iff another user already holds this name (case-insensitive). */
export async function nameClashExists(name: string, excludeUserId?: string): Promise<boolean> {
  const rows = excludeUserId
    ? ((await sql`SELECT id FROM users WHERE lower(display_name) = lower(${name}) AND id <> ${excludeUserId}`) as { id: string }[])
    : ((await sql`SELECT id FROM users WHERE lower(display_name) = lower(${name})`) as { id: string }[]);
  return rows.length > 0;
}

/**
 * Sets a user's global display name. Pre-checks for a clash for a clean
 * result, and catches the `users_display_name_lower_uq` violation as a race
 * backstop (same pattern as lib/claims.ts) so concurrency never 500s.
 */
export async function setDisplayName(
  userId: string,
  name: string,
): Promise<{ ok: true } | { ok: false; reason: "name-taken" }> {
  if (await nameClashExists(name, userId)) return { ok: false, reason: "name-taken" };
  try {
    await sql`UPDATE users SET display_name = ${name} WHERE id = ${userId}`;
  } catch (err) {
    if (isUniqueViolation(err, "users_display_name_lower_uq")) return { ok: false, reason: "name-taken" };
    throw err;
  }
  return { ok: true };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/lib/identity.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.sql src/lib/identity.ts src/lib/identity.test.ts
git commit -m "feat(identity): global display-name columns + setDisplayName/nameClashExists helper"
```

---

## Task 2: Reshape `resolveViewer` to global identity

**Files:**
- Modify: `src/lib/membership.ts`
- Test: `src/lib/membership.test.ts`

**Interfaces:**
- Produces: `Viewer = { userId: string; displayName: string | null; isSuperAdmin: boolean }`. `resolveViewer(): Promise<Viewer | null>` (null iff unauthenticated). `authzResult(viewer, need)` where `need` becomes `"user" | "super-admin"`. `requireUser(): Promise<GuardResult>` (any authenticated user). Consumed by every read/write route in this plan.

**Why:** Global membership = "any authenticated user with a display name." There is no per-group `players` row lookup anymore. Named-ness (having a `display_name`) is what puts you on boards; being authenticated is what grants read access.

- [ ] **Step 1: Write the failing test**

Replace the body of `src/lib/membership.test.ts` with:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = vi.fn();
const authMock = vi.fn();
vi.mock("@/db/client", () => ({ sql: sqlMock }));
vi.mock("@/auth/config", () => ({ auth: authMock }));

const { resolveViewer, authzResult, requireUser, requireSuperAdmin } = await import("./membership");

beforeEach(() => vi.clearAllMocks());

describe("resolveViewer", () => {
  it("returns null when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    expect(await resolveViewer()).toBeNull();
  });
  it("reads display name + super-admin from users (never the JWT)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    sqlMock.mockResolvedValueOnce([{ display_name: "Abeer", is_super_admin: true }]);
    expect(await resolveViewer()).toEqual({ userId: "u1", displayName: "Abeer", isSuperAdmin: true });
  });
  it("tolerates a user row with no name yet", async () => {
    authMock.mockResolvedValue({ user: { id: "u9" } });
    sqlMock.mockResolvedValueOnce([{ display_name: null, is_super_admin: false }]);
    expect(await resolveViewer()).toEqual({ userId: "u9", displayName: null, isSuperAdmin: false });
  });
});

describe("authzResult", () => {
  it("unauthenticated when no viewer", () => {
    expect(authzResult(null, "user")).toBe("unauthenticated");
  });
  it("ok for any authenticated user when need=user", () => {
    expect(authzResult({ userId: "u1", displayName: "A", isSuperAdmin: false }, "user")).toBe("ok");
  });
  it("not-super-admin when need=super-admin and flag is false", () => {
    expect(authzResult({ userId: "u1", displayName: "A", isSuperAdmin: false }, "super-admin")).toBe("not-super-admin");
  });
  it("ok when need=super-admin and flag is true", () => {
    expect(authzResult({ userId: "u1", displayName: "A", isSuperAdmin: true }, "super-admin")).toBe("ok");
  });
});

describe("guards", () => {
  it("requireUser 401s when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const r = await requireUser();
    expect(r).toEqual({ ok: false, status: 401, error: "Unauthenticated" });
  });
  it("requireSuperAdmin 403s a normal user", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    sqlMock.mockResolvedValueOnce([{ display_name: "A", is_super_admin: false }]);
    const r = await requireSuperAdmin();
    expect(r).toEqual({ ok: false, status: 403, error: "Admin only" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/membership.test.ts`
Expected: FAIL (new `Viewer` shape / `requireUser` not exported).

- [ ] **Step 3: Implement the reshape**

Replace `src/lib/membership.ts` with:
```ts
import { sql } from "@/db/client";

export type Viewer = {
  userId: string;
  displayName: string | null;
  isSuperAdmin: boolean;
};

export type AuthzNeed = "user" | "super-admin";
export type AuthzStatus = "ok" | "unauthenticated" | "not-super-admin";

export type GuardResult =
  | { ok: true; viewer: Viewer }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Resolves the current viewer's global identity. DB is the source of truth:
 * name and super-admin are read fresh from `users` on every call — never from
 * the session/JWT, which only carries `userId`. Global membership is implicit:
 * any authenticated user is a "member" of the global board.
 */
export async function resolveViewer(): Promise<Viewer | null> {
  const { auth } = await import("@/auth/config");
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const rows = (await sql`
    SELECT display_name, is_super_admin FROM users WHERE id = ${userId}
  `) as { display_name: string | null; is_super_admin: boolean }[];
  const row = rows[0];
  return {
    userId,
    displayName: row?.display_name ?? null,
    isSuperAdmin: row?.is_super_admin ?? false,
  };
}

/** Pure decision function — no I/O — exhaustively unit-testable. */
export function authzResult(viewer: Viewer | null, need: AuthzNeed): AuthzStatus {
  if (!viewer) return "unauthenticated";
  if (need === "super-admin" && !viewer.isSuperAdmin) return "not-super-admin";
  return "ok";
}

function toGuardResult(viewer: Viewer | null, need: AuthzNeed): GuardResult {
  const status = authzResult(viewer, need);
  switch (status) {
    case "ok":
      return { ok: true, viewer: viewer as Viewer };
    case "unauthenticated":
      return { ok: false, status: 401, error: "Unauthenticated" };
    case "not-super-admin":
      return { ok: false, status: 403, error: "Admin only" };
  }
}

/** Guard for routes that require any authenticated user (the global board). */
export async function requireUser(): Promise<GuardResult> {
  return toGuardResult(await resolveViewer(), "user");
}

/** Guard for platform-owner-only routes (catalog management, admin panel). */
export async function requireSuperAdmin(): Promise<GuardResult> {
  return toGuardResult(await resolveViewer(), "super-admin");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/membership.test.ts`
Expected: PASS. (Route tests will break until Tasks 3–10 update callers — expected; do not fix them here.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/membership.ts src/lib/membership.test.ts
git commit -m "feat(authz): resolveViewer to global identity; requireUser + requireSuperAdmin"
```

---

## Task 3: Catalog management gated by `requireSuperAdmin`

**Files:**
- Modify: `src/app/api/admin/games/route.ts`
- Test: `src/app/api/admin/games/games.test.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin` (Task 2). Drops the `group_id` filter on the catalog (games are global).

- [ ] **Step 1: Update the test**

In `src/app/api/admin/games/games.test.ts`, replace the membership mock so the route imports `requireSuperAdmin`, and assert:
```ts
// mock: vi.mock("@/lib/membership", () => ({ requireSuperAdmin: guardMock }));
it("403s a non-super-admin", async () => {
  guardMock.mockResolvedValue({ ok: false, status: 403, error: "Admin only" });
  const res = await POST(new Request("http://localhost/api/admin/games", { method: "POST", body: "{}" }));
  expect(res.status).toBe(403);
});
it("inserts a catalog game (no group_id) for a super-admin", async () => {
  guardMock.mockResolvedValue({ ok: true, viewer: { userId: "u1", displayName: "A", isSuperAdmin: true } });
  sqlMock.mockResolvedValueOnce([]); // existing check
  sqlMock.mockResolvedValueOnce([]); // insert
  const res = await POST(new Request("http://localhost/api/admin/games", {
    method: "POST",
    body: JSON.stringify({ id: "sudoku", name: "Sudoku", type: "timed", metricDirection: "lower_better", hasVariants: false }),
  }));
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/admin/games/games.test.ts`
Expected: FAIL (route still imports `requireAdmin` / filters by group).

- [ ] **Step 3: Implement**

Replace `src/app/api/admin/games/route.ts`:
```ts
import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireSuperAdmin } from "@/lib/membership";
import { validateNewGame } from "@/lib/validateGame";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const game = validateNewGame(body);
  if ("error" in game) return NextResponse.json({ error: game.error }, { status: 422 });

  const existing = (await sql`SELECT id FROM games WHERE id = ${game.id}`) as { id: string }[];
  if (existing[0]) return NextResponse.json({ error: "Game id already exists" }, { status: 409 });

  await sql`
    INSERT INTO games (id, name, type, metric_direction, parser_id, has_variants)
    VALUES (${game.id}, ${game.name}, ${game.type}, ${game.metricDirection}, ${game.parserId}, ${game.hasVariants})
  `;
  return NextResponse.json({ ok: true, game });
}
```
Note: `games.group_id` is still `NOT NULL` in the DB until Task 12. To keep this INSERT valid pre-cleanup, **Task 11's schema step drops `NOT NULL` on `games.group_id`** before this code ships. If executing strictly in order, gate the deploy of Task 3 behind Task 11's DDL (the controller sequences this).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/app/api/admin/games/games.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/games/route.ts src/app/api/admin/games/games.test.ts
git commit -m "feat(admin): catalog games are global + gated by requireSuperAdmin"
```

---

## Task 4: Entry write → user-scoped + DB-enforced one-per-day

**Files:**
- Modify: `src/db/schema.sql` (partial unique index), `src/app/api/entries/route.ts`
- Test: `src/app/api/entries/entries.test.ts`

**Interfaces:**
- Consumes: `requireUser` (Task 2), `PLATFORM_TZ` (Task 9 — until Task 9 lands, keep reading `groups.timezone`; this task's diff focuses on user-scoping and the unique index. If Task 9 already merged, use `PLATFORM_TZ`).

- [ ] **Step 1: Add the partial UNIQUE index**

Append to `src/db/schema.sql`:
```sql
-- One active entry per user/game/day/variant (DB-enforced; replaces the plain entries_active_idx for dedup)
CREATE UNIQUE INDEX IF NOT EXISTS entries_active_uq
  ON entries (user_id, game_id, puzzle_date, variant)
  WHERE superseded_by IS NULL;
```
(The old `entries_active_idx` on `(group_id, game_id, puzzle_date)` stays as a read index until Task 12.)

- [ ] **Step 2: Write the failing test**

Add to `src/app/api/entries/entries.test.ts` (adapting the existing mocks to `requireUser`):
```ts
it("attributes the entry to the session user_id, not a client id", async () => {
  guardMock.mockResolvedValue({ ok: true, viewer: { userId: "u1", displayName: "A", isSuperAdmin: false } });
  // resolveSubmission is real; feed a valid manual submission
  sqlMock
    .mockResolvedValueOnce([{ timezone: "Asia/Kolkata" }]) // group tz (pre-Task-9)
    .mockResolvedValueOnce([{ id: "wordle" }])              // game exists
    .mockResolvedValueOnce([])                              // prior lookup: none
    .mockResolvedValueOnce([]);                             // insert
  const res = await POST(jsonRequest({ gameId: "wordle", value: 3, solved: true, playerId: "SPOOFED" }));
  expect(res.status).toBe(200);
  // the INSERT bind list must contain u1, never "SPOOFED"
  const insertCall = sqlMock.mock.calls.find((c) => String(c[0].join("")).includes("INSERT INTO entries"));
  expect(insertCall.slice(1)).toContain("u1");
  expect(insertCall.slice(1)).not.toContain("SPOOFED");
});

it("treats a 23505 on entries_active_uq as an idempotent re-log (200, supersede path)", async () => {
  guardMock.mockResolvedValue({ ok: true, viewer: { userId: "u1", displayName: "A", isSuperAdmin: false } });
  sqlMock
    .mockResolvedValueOnce([{ timezone: "Asia/Kolkata" }])
    .mockResolvedValueOnce([{ id: "wordle" }])
    .mockResolvedValueOnce([])                                        // prior: none seen
    .mockRejectedValueOnce({ code: "23505", constraint: "entries_active_uq" }) // race: someone inserted
    .mockResolvedValueOnce([{ id: "e_existing", version: 1 }])        // re-read prior
    .mockResolvedValueOnce([])                                        // insert retry
    .mockResolvedValueOnce([]);                                       // supersede
  const res = await POST(jsonRequest({ gameId: "wordle", value: 3, solved: true }));
  expect(res.status).toBe(200);
});
```
(Exact `sqlMock` ordering must match the implementation below; adjust counts if the implementer restructures — the behavioral assertions, not the call counts, are what matter.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/app/api/entries/entries.test.ts`
Expected: FAIL (route still uses `player_id`, no 23505 handling).

- [ ] **Step 4: Implement**

Rewrite the mutating half of `src/app/api/entries/route.ts` (keeping the parse-failure/Sentry block intact) to attribute by `user_id` and handle the unique-violation:
```ts
const guard = await requireUser();
if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
const userId = guard.viewer.userId;
// ...resolveSubmission unchanged...

// game exists in the catalog (no group filter)
const game = (await sql`SELECT id FROM games WHERE id = ${resolved.gameId} AND active = true`) as { id: string }[];
if (!game[0]) return NextResponse.json({ error: "Unknown game" }, { status: 422 });

const puzzleDate = localDateInTz(timezone); // timezone from PLATFORM_TZ once Task 9 lands
await supersedeAndInsert(userId, resolved, puzzleDate);
return NextResponse.json({ ok: true, parsed: resolved });
```
with a helper that catches `23505` and retries against the now-present prior row:
```ts
async function supersedeAndInsert(userId, resolved, puzzleDate) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const prior = (await sql`
      SELECT id, version FROM entries
      WHERE user_id = ${userId} AND game_id = ${resolved.gameId} AND puzzle_date = ${puzzleDate}
        AND (variant IS NOT DISTINCT FROM ${resolved.variant}) AND superseded_by IS NULL
    `) as { id: string; version: number }[];
    const entryId = newId("e");
    const version = (prior[0]?.version ?? 0) + 1;
    try {
      // Supersede FIRST so the partial unique index has no active duplicate at insert time.
      if (prior[0]) await sql`UPDATE entries SET superseded_by = ${entryId} WHERE id = ${prior[0].id} AND superseded_by IS NULL`;
      await sql`
        INSERT INTO entries (id, user_id, game_id, variant, puzzle_date, puzzle_number, raw_input, parsed_value, solved, is_late, version)
        VALUES (${entryId}, ${userId}, ${resolved.gameId}, ${resolved.variant}, ${puzzleDate},
          ${resolved.puzzleNumber}, ${resolved.rawInput}, ${resolved.value}, ${resolved.solved}, false, ${version})
      `;
      return;
    } catch (err) {
      const e = err as { code?: string; constraint?: string };
      if (e?.code === "23505" && e.constraint === "entries_active_uq" && attempt === 0) continue; // race: re-read prior and retry
      throw err;
    }
  }
}
```
Note: `entries.group_id`/`player_id` are still `NOT NULL` until Task 11 drops those constraints — this INSERT omits them, so **Task 11's DDL (drop NOT NULL on `entries.group_id` and `entries.player_id`) must ship before this code deploys.** The controller sequences the DDL ahead of the code.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/app/api/entries/entries.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.sql src/app/api/entries/route.ts src/app/api/entries/entries.test.ts
git commit -m "feat(entries): user-scoped writes + DB-enforced one-per-day (entries_active_uq, 23505 retry)"
```

---

## Task 5: Leaderboard read → user-scoped, global, `users` join

**Files:**
- Modify: `src/app/api/leaderboard/route.ts`
- Test: `src/app/api/leaderboard/leaderboard.test.ts`

**Interfaces:**
- Consumes: `requireUser`. Feeds the (unchanged) `computeOverall` with `playerId := user_id` and names from `users.display_name`.

- [ ] **Step 1: Update the test** to mock `requireUser` and assert the query joins `users` (not `players`) and drops the `group_id` filter; no-peek still keys on the viewer's `userId`. (Mirror the existing test's structure; change `player_id`→`user_id`, `display_name` source `users`.)

- [ ] **Step 2: Run test to verify it fails** — `npm test -- src/app/api/leaderboard/leaderboard.test.ts` → FAIL.

- [ ] **Step 3: Implement.** Replace the guard + query in `src/app/api/leaderboard/route.ts`:
```ts
const guard = await requireUser();
if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
const viewerUserId = guard.viewer.userId;
const today = localDateInTz(PLATFORM_TZ);
const start = windowStart(window, today);

const rows = (await sql`
  SELECT e.user_id, u.display_name, e.game_id, e.variant, e.puzzle_date::text AS puzzle_date,
         e.parsed_value, e.solved, g.metric_direction
  FROM entries e
  JOIN users u ON u.id = e.user_id
  JOIN games g ON g.id = e.game_id
  WHERE e.superseded_by IS NULL AND e.is_late = false
    AND u.display_name IS NOT NULL AND g.active = true
    AND (${start}::date IS NULL OR e.puzzle_date >= ${start}::date)
    AND e.puzzle_date <= ${today}::date
`) as { user_id: string; display_name: string; game_id: string; variant: string | null;
        puzzle_date: string; parsed_value: number; solved: boolean;
        metric_direction: "lower_better" | "higher_better" }[];
```
Then rename `player_id`→`user_id` throughout the no-peek block (`viewerPlayerId`→`viewerUserId`), the `names` map key, and the `GameEntry.playerId` value (`playerId: r.user_id`). Remove the `groups.timezone` lookup.

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(leaderboard): global user-scoped board (users join, no group filter, named users only)"`

---

## Task 6: `me` read → user-scoped, `users`/catalog

**Files:**
- Modify: `src/app/api/me/route.ts`
- Test: `src/app/api/me/me.test.ts`

- [ ] **Step 1: Update the test** to mock `requireUser`, assert games query drops the group filter (`WHERE active = true`), and entries query keys on `e.user_id = viewer.userId`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Replace guard with `requireUser`; `viewerUserId = guard.viewer.userId`; `today = localDateInTz(PLATFORM_TZ)`; games query `SELECT id, name FROM games WHERE active = true`; entries query:
```ts
const entryRows = (await sql`
  SELECT e.game_id, e.variant, e.puzzle_date::text AS puzzle_date, e.parsed_value, e.solved, g.metric_direction
  FROM entries e JOIN games g ON g.id = e.game_id
  WHERE e.user_id = ${viewerUserId} AND e.superseded_by IS NULL AND e.is_late = false
`) as { /* same shape */ }[];
```
(Every authenticated user has a `userId`, so the `viewerPlayerId ? ... : []` guard is dropped — always query.)
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(me): user-scoped today/streaks on the global catalog"`

---

## Task 7: Game board read → user-scoped, `users` join

**Files:**
- Modify: `src/app/api/games/[gameId]/board/route.ts`
- Test: `src/app/api/games/[gameId]/board/board.test.ts`

- [ ] **Step 1: Update the test** to mock `requireUser`; assert `users` join, no group filter, no-peek keyed on `userId`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `requireUser`; `viewerUserId`; `today = localDateInTz(PLATFORM_TZ)`; query joins `users u ON u.id = e.user_id`, selects `e.user_id, u.display_name`, drops `e.group_id`, adds `AND u.display_name IS NOT NULL`; rename `player_id`→`user_id` in `playedToday`, `names`, and `DatedGameEntry.playerId`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(board): user-scoped per-game board (users join, global)"`

---

## Task 8: `games` + `players` list reads → global

**Files:**
- Modify: `src/app/api/games/route.ts`, `src/app/api/players/route.ts`
- Test: `src/app/api/games/games.test.ts`, `src/app/api/players/players.test.ts`

- [ ] **Step 1: Update tests** — `games` route uses `requireUser` and `SELECT ... FROM games WHERE active = true ORDER BY name` (no group filter). `players` route (read `src/app/api/players/route.ts` first) becomes "all named users": `requireUser` + `SELECT id, display_name FROM users WHERE display_name IS NOT NULL ORDER BY display_name`, returning `{ players: [{ id, displayName }] }` (keep the response shape the client expects; verify against `src/lib/api.ts`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** both routes per above.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(lists): games + players lists go global (catalog + all named users)"`

---

## Task 9: Platform timezone constant

**Files:**
- Modify: `src/lib/group.ts`, and every route that read `groups.timezone` (entries, leaderboard, me, board — some already updated in Tasks 4–7 to use `PLATFORM_TZ`)
- Test: `src/lib/group.test.ts` (new, trivial)

**Interfaces:**
- Produces: `export const PLATFORM_TZ = "Asia/Kolkata";` — consumed by all day-boundary computations.

- [ ] **Step 1: Write the test** `src/lib/group.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { PLATFORM_TZ } from "./group";
describe("PLATFORM_TZ", () => {
  it("is the platform timezone", () => { expect(PLATFORM_TZ).toBe("Asia/Kolkata"); });
});
```
- [ ] **Step 2: Run** → FAIL (`PLATFORM_TZ` not exported).
- [ ] **Step 3: Implement.** Replace `src/lib/group.ts`:
```ts
// Single platform timezone for day boundaries (was groups.timezone under the single-group model).
export const PLATFORM_TZ = "Asia/Kolkata";
```
Then grep for remaining `groups.timezone` reads and `GROUP_ID` imports; replace each `localDateInTz(groupRows[0].timezone)` with `localDateInTz(PLATFORM_TZ)` and delete the now-dead `SELECT timezone FROM groups` lookups. Run `grep -rn "GROUP_ID\|groups.timezone\|from \"@/lib/group\"" src/` and resolve every hit.
- [ ] **Step 4: Run** `npm test` (full) → PASS; `grep -rn "groups.timezone" src/` returns nothing.
- [ ] **Step 5: Commit** — `git commit -m "feat(day): single platform timezone constant, drop per-request groups.timezone reads"`

---

## Task 10: Rename → global `users.display_name`; retire admin rename

**Files:**
- Modify: `src/app/api/me/rename/route.ts`
- Delete: `src/app/api/admin/players/rename/route.ts`, `src/app/api/admin/players/rename/rename.test.ts`
- Test: `src/app/api/me/rename/rename.test.ts`

- [ ] **Step 1: Update the test** — `requireUser`; success updates `users.display_name` via `setDisplayName`; 409 on global clash; identity from session only (body `playerId`/`userId` ignored). Add a test that a body-supplied `userId` is not used.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Replace `src/app/api/me/rename/route.ts` to use `requireUser` + `setDisplayName` (Task 1):
```ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/membership";
import { setDisplayName } from "@/lib/identity";

export const runtime = "nodejs";
const MAX_NAME_LENGTH = 40;

export async function POST(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const body = (await req.json().catch(() => ({}))) as { newName?: unknown };
  const raw = typeof body.newName === "string" ? body.newName.trim() : "";
  if (!raw) return NextResponse.json({ error: "newName required" }, { status: 400 });
  if (raw.length > MAX_NAME_LENGTH) return NextResponse.json({ error: `newName must be ${MAX_NAME_LENGTH} characters or fewer` }, { status: 400 });

  const result = await setDisplayName(guard.viewer.userId, raw);
  if (!result.ok) return NextResponse.json({ error: "That name is taken — pick another." }, { status: 409 });
  return NextResponse.json({ ok: true, displayName: raw });
}
```
Then `git rm` the admin rename route + test.
- [ ] **Step 4: Run** `npm test -- src/app/api/me/rename` → PASS; full suite has no references to the deleted route.
- [ ] **Step 5: Commit** — `git commit -m "feat(rename): self-service rename targets global users.display_name; retire admin players/rename"`

---

## Task 11: Backfill + verification script; global-name index; drop NOT NULLs

**Files:**
- Create: `scripts/backfill-phase1.mjs`
- Modify: `src/db/schema.sql` (global-name unique index; drop NOT NULL on legacy FKs)
- Test: `scripts/backfill-phase1.test.mjs` (pure verification-logic test) — or a unit test of an extracted pure `verify()` in `src/lib`

**Interfaces:** the script is idempotent and safe to re-run; it never drops data.

- [ ] **Step 1: Add DDL to `src/db/schema.sql`** (additive/relaxing only):
```sql
-- Phase 1 cutover prerequisites: relax legacy NOT NULLs so user-scoped writes and global catalog inserts are valid
ALTER TABLE entries ALTER COLUMN group_id DROP NOT NULL;
ALTER TABLE entries ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE games ALTER COLUMN group_id DROP NOT NULL;
```
The global-name unique index is created by the script (Step 3) AFTER the collision gate, not in schema.sql (so a collision can't wedge `migrate.mjs`).

- [ ] **Step 2: Write the failing test** for the pure verification logic (extract `summarize(rows)` returning `{ entriesMissingUserId, usersMissingName, nameCollisions }`), asserting it flags a collision and a missing backfill. Run → FAIL.

- [ ] **Step 3: Implement `scripts/backfill-phase1.mjs`** (mirrors `scripts/migrate.mjs`'s Neon connection; loads `DATABASE_URL`):
```js
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

// 1. Backfill display names from the single players row per user.
await sql`UPDATE users u SET display_name = p.display_name FROM players p WHERE p.user_id = u.id AND u.display_name IS NULL`;
// 2. Backfill entries.user_id from the owning player.
await sql`UPDATE entries e SET user_id = p.user_id FROM players p WHERE e.player_id = p.id AND e.user_id IS NULL`;
// 3. Set the platform owner as super-admin (idempotent; email is the owner's).
await sql`UPDATE users SET is_super_admin = true WHERE email = ${process.env.OWNER_EMAIL}`;

// 4. HARD GATE: no case-insensitive display-name collisions.
const collisions = await sql`SELECT lower(display_name) AS n, count(*) c FROM users WHERE display_name IS NOT NULL GROUP BY 1 HAVING count(*) > 1`;
if (collisions.length > 0) { console.error("ABORT: name collisions", collisions); process.exit(1); }

// 5. Verify backfill completeness.
const missing = await sql`SELECT count(*) c FROM entries WHERE user_id IS NULL AND player_id IS NOT NULL`;
if (Number(missing[0].c) > 0) { console.error("ABORT: entries without user_id", missing[0].c); process.exit(1); }

// 6. Create the global-name unique index (only now that the gate passed).
await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_display_name_lower_uq ON users (lower(display_name))`;
console.log("Phase 1 backfill complete.");
```

- [ ] **Step 4: Run** the pure verification test → PASS. (The script itself runs against preview/prod as a guided step, not in CI.)

- [ ] **Step 5: Commit** — `git commit -m "feat(migrate): phase-1 backfill + verification script; relax legacy NOT NULLs; global-name index"`

**Guided (G1/G2):** controller runs `set -a && . ./.env.local && set +a && OWNER_EMAIL=... node scripts/backfill-phase1.mjs` against the **preview** branch first, then (with owner go-ahead + backup) against prod.

---

## Task 12: Cutover cleanup — dissolve g1, drop legacy (runs LAST, after prod is healthy)

**Files:**
- Modify: `src/db/schema.sql` (drops), potentially `scripts/backfill-phase1.mjs` (append cleanup, or a separate `scripts/cleanup-phase1.mjs`)
- Test: none (destructive DDL; covered by the guided verification)

**Interfaces:** runs only after the new code is confirmed live and healthy on prod (deploy gate G2).

- [ ] **Step 1: Author the cleanup DDL** in a **separate** `scripts/cleanup-phase1.mjs` (NOT in schema.sql, so it never re-runs via `migrate.mjs`), ordered:
```js
// Order matters: drop FK-holders into players/groups BEFORE removing those rows.
await sql`DROP TABLE IF EXISTS join_eligibility`;
await sql`DROP TABLE IF EXISTS claims`;
// g1 dissolves into "global": remove its membership rows and the group row.
await sql`DELETE FROM players WHERE group_id = 'g1'`;
await sql`DELETE FROM groups WHERE id = 'g1'`;
// Drop the superseded per-group name index and vestigial columns.
await sql`DROP INDEX IF EXISTS players_group_lower_name_uq`;
await sql`ALTER TABLE entries DROP COLUMN IF EXISTS group_id`;
await sql`ALTER TABLE entries DROP COLUMN IF EXISTS player_id`;
await sql`ALTER TABLE games DROP COLUMN IF EXISTS group_id`;
```
(`players` is retained as an empty table only if Phase 2 still needs the name; otherwise Phase 2's memberships task handles it. Do NOT drop `players` here — onboarding still writes to it until Phase 2.)

- [ ] **Step 2: Remove now-dead reads of dropped columns** — grep `src/` for `entries.group_id`, `player_id`, `games.group_id`, `entries_active_idx`; delete the old `entries_active_idx` line from `schema.sql`. Confirm `npm test && npm run build` stay green.

- [ ] **Step 3: Commit** — `git commit -m "chore(cutover): dissolve g1, drop claims/join_eligibility + vestigial columns"`

**Guided (G2):** controller runs `scripts/cleanup-phase1.mjs` against preview, verifies the app, then prod — only after the Task 1–11 code is live and healthy, with owner go-ahead. Neon point-in-time restore + the `pre-multigroup` backup are the safety net.

---

## Self-review

**Spec coverage** (against `2026-07-04-multi-group-design.md`, Phase 1 scope):
- Global display name + uniqueness → Tasks 1, 11. ✓
- `is_super_admin` + admin split → Tasks 2, 3. ✓
- Entries user-scoped + DB-enforced one-per-day (partial UNIQUE + 23505) → Task 4. ✓
- Global reads (leaderboard/me/board/games/players), `users` join, named-users-only, `games.active` → Tasks 5–8. ✓
- Platform timezone → Task 9. ✓
- Rename → global; retire admin rename → Task 10. ✓
- Backfill (exact SQL), collision gate, index-after-gate → Task 11. ✓
- Cutover ordering (drop claims/join_eligibility before g1 rows; drop NOT NULL before columns) → Tasks 11–12. ✓
- Backup branch+tag, no prod change without go-ahead, secret-free → Global Constraints + Deploy gates. ✓
- No-peek stays over the viewer's global play → preserved in Tasks 5, 7 (logic unchanged, keyed on userId). ✓

**Not in Phase 1 (Phase 2):** memberships/roles, group_games, create/join/manage/leave, board switcher, overflow menu, reset-link, auto-promote, retiring the `players`/onboarding player-creation path.

**Sequencing note for the controller:** the schema DDL that *relaxes* constraints (Task 11 Step 1) and the global-name index (Task 11 Step 3, via script) must be applied to a DB **before** the code that depends on them is deployed there. In subagent-driven execution the code tasks can be built/committed in order 1→10, but the preview/prod **apply** of Task 11's relaxing DDL is gated ahead of deploying Tasks 3/4. This is called out in Tasks 3 and 4.

**Placeholder scan:** no TBD/TODO; each code step carries real code or an exact grep/rewrite instruction. Tasks 5–8 give the full changed query and enumerate the mechanical renames rather than repeating every unchanged line (the diffs are structurally identical to the shown Task 5 query).

**Type consistency:** `Viewer` is `{ userId, displayName, isSuperAdmin }` everywhere post-Task-2; guards return `GuardResult`; `requireUser`/`requireSuperAdmin` names are used verbatim in Tasks 3–10; `PLATFORM_TZ` name is consistent in Tasks 4–9; `setDisplayName`/`nameClashExists` match between Tasks 1 and 10.
