# Multi-Group Phase 2a — Backend (memberships, groups, invites, authz, group-scoped reads) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the server foundation for user-created groups — a `memberships` model, group CRUD, permanent resettable invite links, per-group role authz, and group-scoped board reads — on top of the Phase 1 global model, with the global board unchanged.

**Architecture:** New `memberships` and `group_games` tables; a per-group invite token hash stored on `groups`. A `src/lib/groups.ts` domain module holds all group/membership logic (create/join/leave/remove/rename/set-games/reset-invite/list), using atomic conditional writes + `23505` catches (no interactive transactions on the Neon HTTP driver). Two new authz guards (`requireMember(groupId)`, `requireGroupAdmin(groupId)`) resolve role server-side from `memberships`. The four board-read routes gain an optional `?group=<id>` param: absent → the global board (any authenticated user); present → membership-gated and filtered to the group's members × its tracked-and-active games. No frontend in this plan (Phase 2b).

**Tech Stack:** Next.js 14.2 App Router, TypeScript, Neon Postgres (`@neondatabase/serverless` HTTP driver — stateless, NO interactive transactions), Auth.js v5, Vitest.

## Global Constraints

- **Stateless DB driver:** no interactive transactions / no `FOR UPDATE`. Concurrency correctness comes from **partial/plain UNIQUE indexes + catching `23505`** and **single atomic conditional statements** (`UPDATE … WHERE … AND NOT EXISTS(…)`, `DELETE … WHERE NOT EXISTS(…)`), never check-then-write.
- **Migrations** applied by `scripts/migrate.mjs`, which splits `src/db/schema.sql` on `;` — **never a `;` inside a SQL comment.** All DDL uses `IF NOT EXISTS`.
- **DB is the source of truth** for membership and roles; the JWT carries only `userId`. Never trust a client-supplied id/role for authorization; `groupId` from the URL is authorized against `memberships`, never assumed.
- **Server-side authz on every endpoint:** create/join/leave → `requireUser`; manage (rename/games/remove/reset/delete) → `requireGroupAdmin(groupId)`; group-board reads → `requireMember(groupId)`; global reads → `requireUser`.
- **Invite tokens are stored hash-only** (sha256), never in plaintext at rest. Reset invalidates the prior token.
- **CI must stay green and the build secret-free** (`npm run typecheck && npm run lint && npm test && npm run build`).
- **No production merge or prod DB change without the owner's explicit go-ahead.** Phase 2 ships together with Phase 1 (single coordinated release); this branch stacks on `feat/multi-group-phase1`.
- **Branch:** `feat/multi-group-phase2` created off `feat/multi-group-phase1`. Never commit to `main`.
- **Group display names are NOT globally unique** (groups are private); no uniqueness constraint on `groups.name`. Person display names remain globally unique (Phase 1, unchanged).

## Phase 1 interfaces this plan consumes (already on the base branch)
- `@/lib/membership`: `Viewer = { userId: string; displayName: string | null; isSuperAdmin: boolean }`, `resolveViewer()`, `requireUser()`, `requireSuperAdmin()`, `GuardResult = { ok: true; viewer: Viewer } | { ok: false; status: 401|403; error: string }`.
- `@/lib/group`: `PLATFORM_TZ` (no `GROUP_ID`).
- `@/lib/identity`: `setDisplayName(userId, name)`, `nameClashExists(name, excludeUserId?)`.
- `@/lib/ids`: `newId(prefix)`.
- Reads (`/api/leaderboard`, `/api/me`, `/api/games`, `/api/games/[gameId]/board`) are global, user-scoped, join `users`, `requireUser`-gated, and use `PLATFORM_TZ`. Entries are `user_id`-scoped. Games are a global catalog (`games.active`).

---

## File structure
- `src/db/schema.sql` — add `memberships`, `group_games`, `groups.invite_token_hash` (all additive).
- `src/lib/dbError.ts` — **new**: shared `isUniqueViolation(err, constraint)` (dedupes the copies in `identity.ts` + `entries/route.ts`).
- `src/lib/inviteToken.ts` — **new**: `generateInviteToken()` → `{ token, tokenHash }`, `hashInviteToken(token)` (sha256).
- `src/lib/groups.ts` — **new**: all group/membership domain logic (pure-ish DB functions + one pure decision helper `pickSuccessor`).
- `src/lib/membership.ts` — **modify**: add `requireMember(groupId)` and `requireGroupAdmin(groupId)` (+ a pure `roleFor` helper), keep Phase 1 exports.
- API routes (**new**): `src/app/api/groups/route.ts`, `groups/[groupId]/route.ts`, `groups/[groupId]/games/route.ts`, `groups/[groupId]/members/[userId]/route.ts`, `groups/[groupId]/leave/route.ts`, `groups/[groupId]/invite/route.ts`, `groups/join/route.ts`, `groups/preview/route.ts`.
- Read routes (**modify**): `leaderboard/route.ts`, `me/route.ts`, `games/route.ts`, `games/[gameId]/board/route.ts` — optional `?group=`.
- `src/lib/api.ts` — **modify**: group client fns + `group` param on the read fns.
- `src/app/api/onboarding/route.ts` — **modify**: add the 40-char name cap (folded Phase 1 minor).
- `src/app/api/admin/games/games.test.ts` — **modify**: restore 401/422/409 coverage (folded Phase 1 minor).

---

## Task 1: Schema + shared `isUniqueViolation` + invite-token helper

**Files:** Create `src/lib/dbError.ts`, `src/lib/dbError.test.ts`, `src/lib/inviteToken.ts`, `src/lib/inviteToken.test.ts`; Modify `src/db/schema.sql`, `src/lib/identity.ts`, `src/app/api/entries/route.ts`.

**Interfaces produced:** `isUniqueViolation(err: unknown, constraint: string): boolean`; `generateInviteToken(): { token: string; tokenHash: string }`; `hashInviteToken(token: string): string`.

- [ ] **Step 1: Add additive schema** (append to `src/db/schema.sql`; no `;` in comments):
```sql
-- === Multi-group Phase 2: memberships, per-group game selection, invite token ===
CREATE TABLE IF NOT EXISTS memberships (
  id         TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships (user_id);

CREATE TABLE IF NOT EXISTS group_games (
  group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  game_id   TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, game_id)
);

ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_token_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS groups_invite_token_hash_uq ON groups (invite_token_hash) WHERE invite_token_hash IS NOT NULL;
```

- [ ] **Step 2: Write failing tests** `src/lib/dbError.test.ts` and `src/lib/inviteToken.test.ts`:
```ts
// dbError.test.ts
import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "./dbError";
describe("isUniqueViolation", () => {
  it("true for matching code+constraint", () => {
    expect(isUniqueViolation({ code: "23505", constraint: "x_uq" }, "x_uq")).toBe(true);
  });
  it("false for other constraint or code, or non-object", () => {
    expect(isUniqueViolation({ code: "23505", constraint: "y" }, "x_uq")).toBe(false);
    expect(isUniqueViolation({ code: "23502", constraint: "x_uq" }, "x_uq")).toBe(false);
    expect(isUniqueViolation(undefined, "x_uq")).toBe(false);
  });
});
```
```ts
// inviteToken.test.ts
import { describe, it, expect } from "vitest";
import { generateInviteToken, hashInviteToken } from "./inviteToken";
describe("invite token", () => {
  it("hash is deterministic sha256 hex (64 chars) and not the token", () => {
    const { token, tokenHash } = generateInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(20);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toBe(token);
    expect(hashInviteToken(token)).toBe(tokenHash);
  });
  it("two tokens differ", () => {
    expect(generateInviteToken().token).not.toBe(generateInviteToken().token);
  });
});
```

- [ ] **Step 3: Run to verify fail** — `npm test -- src/lib/dbError.test.ts src/lib/inviteToken.test.ts` → FAIL (modules missing).

- [ ] **Step 4: Implement**
```ts
// src/lib/dbError.ts
interface NeonDbErrorLike { code?: string; constraint?: string }
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as NeonDbErrorLike | undefined;
  return !!e && e.code === "23505" && e.constraint === constraint;
}
```
```ts
// src/lib/inviteToken.ts
import { randomBytes, createHash } from "node:crypto";
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(18).toString("base64url"); // ~24 url-safe chars
  return { token, tokenHash: hashInviteToken(token) };
}
```

- [ ] **Step 5: Dedupe** — in `src/lib/identity.ts` and `src/app/api/entries/route.ts`, delete the local `isUniqueViolation`/`NeonDbErrorLike` and `import { isUniqueViolation } from "@/lib/dbError";` instead. No behavior change.

- [ ] **Step 6: Run** `npm test -- src/lib/dbError.test.ts src/lib/inviteToken.test.ts src/lib/identity.test.ts src/app/api/entries/entries.test.ts` → PASS.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(db): memberships + group_games + invite-token-hash schema; shared isUniqueViolation + invite-token helpers"`

---

## Task 2: `requireMember(groupId)` + `requireGroupAdmin(groupId)`

**Files:** Modify `src/lib/membership.ts`, `src/lib/membership.test.ts`.

**Interfaces produced:** `roleFor(rows: {role:string}[]): "admin"|"member"|null` (pure); `requireMember(groupId: string): Promise<GuardResult>`; `requireGroupAdmin(groupId: string): Promise<GuardResult>`. Both 401 if unauthenticated, 403 if not a member / not an admin of that group. On ok, `viewer` is the Phase 1 `Viewer`.

- [ ] **Step 1: Failing test** (append to `membership.test.ts`):
```ts
describe("group guards", () => {
  it("roleFor returns the role or null", () => {
    expect(roleFor([{ role: "admin" }])).toBe("admin");
    expect(roleFor([{ role: "member" }])).toBe("member");
    expect(roleFor([])).toBeNull();
  });
  it("requireMember 403s a non-member", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    sqlMock.mockResolvedValueOnce([{ display_name: "A", is_super_admin: false }]); // resolveViewer
    sqlMock.mockResolvedValueOnce([]); // no membership row
    const r = await requireMember("g_x");
    expect(r).toEqual({ ok: false, status: 403, error: "Not a member" });
  });
  it("requireGroupAdmin 403s a plain member but allows an admin", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    sqlMock.mockResolvedValueOnce([{ display_name: "A", is_super_admin: false }]);
    sqlMock.mockResolvedValueOnce([{ role: "member" }]);
    expect((await requireGroupAdmin("g_x")).ok).toBe(false);

    authMock.mockResolvedValue({ user: { id: "u2" } });
    sqlMock.mockResolvedValueOnce([{ display_name: "B", is_super_admin: false }]);
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    expect((await requireGroupAdmin("g_x")).ok).toBe(true);
  });
});
```
(Import `roleFor`, `requireMember`, `requireGroupAdmin` in the test.)

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** (add to `src/lib/membership.ts`):
```ts
export function roleFor(rows: { role: string }[]): "admin" | "member" | null {
  const r = rows[0]?.role;
  return r === "admin" || r === "member" ? r : null;
}

async function resolveGroupRole(groupId: string): Promise<{ viewer: Viewer; role: "admin" | "member" | null } | null> {
  const viewer = await resolveViewer();
  if (!viewer) return null;
  const rows = (await sql`
    SELECT role FROM memberships WHERE group_id = ${groupId} AND user_id = ${viewer.userId}
  `) as { role: string }[];
  return { viewer, role: roleFor(rows) };
}

export async function requireMember(groupId: string): Promise<GuardResult> {
  const r = await resolveGroupRole(groupId);
  if (!r) return { ok: false, status: 401, error: "Unauthenticated" };
  if (r.role === null) return { ok: false, status: 403, error: "Not a member" };
  return { ok: true, viewer: r.viewer };
}

export async function requireGroupAdmin(groupId: string): Promise<GuardResult> {
  const r = await resolveGroupRole(groupId);
  if (!r) return { ok: false, status: 401, error: "Unauthenticated" };
  if (r.role !== "admin") return { ok: false, status: 403, error: "Admin only" };
  return { ok: true, viewer: r.viewer };
}
```

- [ ] **Step 4: Run** `npm test -- src/lib/membership.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(authz): requireMember/requireGroupAdmin resolve per-group role from memberships"`

---

## Task 3: `groups.ts` — create + list

**Files:** Create `src/lib/groups.ts`, `src/lib/groups.test.ts`.

**Interfaces produced:**
- `createGroup(userId: string, name: string, gameIds: string[]): Promise<{ ok: true; id: string; token: string } | { ok: false; reason: "invalid-name" }>` — inserts group (`created_by=userId`), the creator's `memberships` row (`role='admin'`), `group_games` for each valid gameId, and an invite token (stores hash on the group). Trims name; rejects empty / >40 chars.
- `listMyGroups(userId: string): Promise<{ id: string; name: string; role: "admin"|"member" }[]>` — the groups the user belongs to, ordered by name.

- [ ] **Step 1: Failing test** `src/lib/groups.test.ts` (mock `@/db/client`, `@/lib/ids`, `@/lib/inviteToken`):
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const sqlMock = vi.fn();
vi.mock("@/db/client", () => ({ sql: sqlMock }));
vi.mock("@/lib/ids", () => ({ newId: (p: string) => `${p}_test` }));
vi.mock("@/lib/inviteToken", () => ({ generateInviteToken: () => ({ token: "tok", tokenHash: "hash" }) }));
const { createGroup, listMyGroups } = await import("./groups");
beforeEach(() => { vi.clearAllMocks(); sqlMock.mockResolvedValue([]); });

describe("createGroup", () => {
  it("rejects an empty name without touching the DB", async () => {
    const r = await createGroup("u1", "   ", ["wordle"]);
    expect(r).toEqual({ ok: false, reason: "invalid-name" });
    expect(sqlMock).not.toHaveBeenCalled();
  });
  it("rejects a name over 40 chars", async () => {
    const r = await createGroup("u1", "x".repeat(41), []);
    expect(r).toEqual({ ok: false, reason: "invalid-name" });
  });
  it("creates group + admin membership + group_games + token", async () => {
    const r = await createGroup("u1", "  Family  ", ["wordle", "mini"]);
    expect(r).toEqual({ ok: true, id: "grp_test", token: "tok" });
    const sqlText = sqlMock.mock.calls.map((c) => String(c[0].join("?"))).join("\n");
    expect(sqlText).toContain("INSERT INTO groups");
    expect(sqlText).toContain("INSERT INTO memberships");
    expect(sqlText).toContain("INSERT INTO group_games");
    // trimmed name bound
    expect(sqlMock.mock.calls.flatMap((c) => c.slice(1))).toContain("Family");
  });
});

describe("listMyGroups", () => {
  it("maps rows to {id,name,role}", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "g1", name: "Fam", role: "admin" }]);
    expect(await listMyGroups("u1")).toEqual([{ id: "g1", name: "Fam", role: "admin" }]);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `src/lib/groups.ts`:
```ts
import { sql } from "@/db/client";
import { newId } from "@/lib/ids";
import { generateInviteToken } from "@/lib/inviteToken";

const MAX_NAME_LENGTH = 40;

export async function createGroup(
  userId: string,
  name: string,
  gameIds: string[],
): Promise<{ ok: true; id: string; token: string } | { ok: false; reason: "invalid-name" }> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return { ok: false, reason: "invalid-name" };

  const groupId = newId("grp");
  const { token, tokenHash } = generateInviteToken();
  await sql`INSERT INTO groups (id, name, created_by, invite_token_hash) VALUES (${groupId}, ${trimmed}, ${userId}, ${tokenHash})`;
  await sql`INSERT INTO memberships (id, group_id, user_id, role) VALUES (${newId("mem")}, ${groupId}, ${userId}, 'admin')`;
  // Only track games that exist in the active catalog; ignore unknown ids.
  for (const gameId of gameIds) {
    await sql`INSERT INTO group_games (group_id, game_id) SELECT ${groupId}, id FROM games WHERE id = ${gameId} AND active = true ON CONFLICT DO NOTHING`;
  }
  return { ok: true, id: groupId, token };
}

export async function listMyGroups(
  userId: string,
): Promise<{ id: string; name: string; role: "admin" | "member" }[]> {
  const rows = (await sql`
    SELECT g.id, g.name, m.role FROM memberships m
    JOIN groups g ON g.id = m.group_id
    WHERE m.user_id = ${userId}
    ORDER BY g.name
  `) as { id: string; name: string; role: "admin" | "member" }[];
  return rows.map((r) => ({ id: r.id, name: r.name, role: r.role }));
}
```
Note: `groups` still has legacy NOT-NULL columns (`passphrase_hash`, `timezone`) until the deferred Task 12 cleanup. Those are dropped in Phase 1's Task 12 PR, which lands before this deploys — but to keep this INSERT valid regardless of ordering, **the schema step in Task 1 also relaxes them**: add to Task 1's DDL `ALTER TABLE groups ALTER COLUMN passphrase_hash DROP NOT NULL;` and `ALTER TABLE groups ALTER COLUMN timezone DROP NOT NULL;` (idempotent; harmless if already dropped/nullable).

- [ ] **Step 4: Run** `npm test -- src/lib/groups.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(groups): createGroup + listMyGroups"`

---

## Task 4: `groups.ts` — join via token + preview

**Files:** Modify `src/lib/groups.ts`, `src/lib/groups.test.ts`.

**Interfaces produced:**
- `joinViaToken(userId: string, token: string): Promise<{ ok: true; groupId: string } | { ok: false; reason: "invalid-token" }>` — hashes the token, finds the group, inserts a `member` membership; idempotent (a duplicate `UNIQUE(group_id,user_id)` `23505` → treated as success/already-member).
- `groupPreviewByToken(token: string): Promise<{ id: string; name: string; memberCount: number; gameCount: number } | null>`.

- [ ] **Step 1: Failing test** (append):
```ts
import { generateInviteToken } from "@/lib/inviteToken"; // real hash not needed; mock returns "hash"
// add to the inviteToken mock: hashInviteToken: (t: string) => `h(${t})`
describe("joinViaToken", () => {
  it("invalid token → invalid-token", async () => {
    sqlMock.mockResolvedValueOnce([]); // group lookup by hash: none
    expect(await joinViaToken("u1", "bad")).toEqual({ ok: false, reason: "invalid-token" });
  });
  it("valid token inserts a member membership", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "g1" }]); // group found
    sqlMock.mockResolvedValueOnce([]); // insert membership
    expect(await joinViaToken("u1", "good")).toEqual({ ok: true, groupId: "g1" });
  });
  it("already-member (23505) is treated as success", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "g1" }]);
    sqlMock.mockRejectedValueOnce({ code: "23505", constraint: "memberships_group_id_user_id_key" });
    expect(await joinViaToken("u1", "good")).toEqual({ ok: true, groupId: "g1" });
  });
});
```
(The `UNIQUE (group_id, user_id)` constraint's default name is `memberships_group_id_user_id_key` — the implementation must catch by that exact name; confirm it in the created schema.)

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** (append to `groups.ts`; import `hashInviteToken` from `@/lib/inviteToken`, `isUniqueViolation` from `@/lib/dbError`, `newId`):
```ts
export async function joinViaToken(
  userId: string,
  token: string,
): Promise<{ ok: true; groupId: string } | { ok: false; reason: "invalid-token" }> {
  const hash = hashInviteToken(token);
  const rows = (await sql`SELECT id FROM groups WHERE invite_token_hash = ${hash}`) as { id: string }[];
  const groupId = rows[0]?.id;
  if (!groupId) return { ok: false, reason: "invalid-token" };
  try {
    await sql`INSERT INTO memberships (id, group_id, user_id, role) VALUES (${newId("mem")}, ${groupId}, ${userId}, 'member')`;
  } catch (err) {
    if (!isUniqueViolation(err, "memberships_group_id_user_id_key")) throw err;
    // already a member — idempotent success
  }
  return { ok: true, groupId };
}

export async function groupPreviewByToken(
  token: string,
): Promise<{ id: string; name: string; memberCount: number; gameCount: number } | null> {
  const hash = hashInviteToken(token);
  const rows = (await sql`
    SELECT g.id, g.name,
           (SELECT count(*) FROM memberships m WHERE m.group_id = g.id) AS member_count,
           (SELECT count(*) FROM group_games gg JOIN games ga ON ga.id = gg.game_id AND ga.active = true WHERE gg.group_id = g.id) AS game_count
    FROM groups g WHERE g.invite_token_hash = ${hash}
  `) as { id: string; name: string; member_count: number; game_count: number }[];
  const r = rows[0];
  return r ? { id: r.id, name: r.name, memberCount: Number(r.member_count), gameCount: Number(r.game_count) } : null;
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(groups): joinViaToken (idempotent) + groupPreviewByToken"`

---

## Task 5: `groups.ts` — leave (auto-promote / last-member-delete), remove member

**Files:** Modify `src/lib/groups.ts`, `src/lib/groups.test.ts`.

**Interfaces produced:**
- `leaveGroup(userId: string, groupId: string): Promise<{ ok: true }>` — deletes the caller's membership, then (idempotent, order-safe): promote the oldest remaining member to admin **iff no admin remains**, then delete the group **iff no members remain**.
- `removeMember(groupId: string, targetUserId: string): Promise<{ ok: true }>` — deletes the target's membership (caller must be admin — enforced at the route). Applies the same post-removal promote/delete reconciliation so removing the last-admin-then-empty stays consistent.
- `pickSuccessorSql` is inlined; the promotion is a single conditional `UPDATE`.

- [ ] **Step 1: Failing test** (append) — assert the three statements run in order (delete → conditional promote → conditional delete-group), and that removeMember reconciles too:
```ts
describe("leaveGroup", () => {
  it("runs delete-self, then conditional promote, then conditional group-delete", async () => {
    sqlMock.mockResolvedValue([]);
    await leaveGroup("u1", "g1");
    const texts = sqlMock.mock.calls.map((c) => String(c[0].join("?")));
    expect(texts[0]).toContain("DELETE FROM memberships");
    expect(texts[1]).toContain("UPDATE memberships SET role = 'admin'");
    expect(texts[1]).toContain("NOT EXISTS");
    expect(texts[2]).toContain("DELETE FROM groups");
    expect(texts[2]).toContain("NOT EXISTS");
  });
});
describe("removeMember", () => {
  it("deletes the target then reconciles admin/empty", async () => {
    sqlMock.mockResolvedValue([]);
    await removeMember("g1", "u2");
    const texts = sqlMock.mock.calls.map((c) => String(c[0].join("?")));
    expect(texts[0]).toContain("DELETE FROM memberships");
    expect(texts.some((t) => t.includes("UPDATE memberships SET role = 'admin'"))).toBe(true);
    expect(texts.some((t) => t.includes("DELETE FROM groups"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** (append). Each statement is independently safe to re-run; ordering: remove the row, then promote-if-no-admin, then delete-if-empty:
```ts
async function reconcileAfterRemoval(groupId: string): Promise<void> {
  // Promote the oldest remaining member to admin, but only if no admin remains.
  await sql`
    UPDATE memberships SET role = 'admin'
    WHERE group_id = ${groupId} AND role = 'member'
      AND NOT EXISTS (SELECT 1 FROM memberships WHERE group_id = ${groupId} AND role = 'admin')
      AND id = (SELECT id FROM memberships WHERE group_id = ${groupId} AND role = 'member' ORDER BY joined_at, id LIMIT 1)
  `;
  // Delete the group if it now has no members at all.
  await sql`DELETE FROM groups WHERE id = ${groupId} AND NOT EXISTS (SELECT 1 FROM memberships WHERE group_id = ${groupId})`;
}

export async function leaveGroup(userId: string, groupId: string): Promise<{ ok: true }> {
  await sql`DELETE FROM memberships WHERE group_id = ${groupId} AND user_id = ${userId}`;
  await reconcileAfterRemoval(groupId);
  return { ok: true };
}

export async function removeMember(groupId: string, targetUserId: string): Promise<{ ok: true }> {
  await sql`DELETE FROM memberships WHERE group_id = ${groupId} AND user_id = ${targetUserId}`;
  await reconcileAfterRemoval(groupId);
  return { ok: true };
}
```
Note: `ON DELETE CASCADE` on `memberships.group_id`/`group_games.group_id` means the final `DELETE FROM groups` also clears their rows.

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(groups): leave/removeMember with atomic auto-promote + last-member group delete"`

---

## Task 6: `groups.ts` — rename, set tracked games, reset invite, get invite

**Files:** Modify `src/lib/groups.ts`, `src/lib/groups.test.ts`.

**Interfaces produced:**
- `renameGroup(groupId, name): Promise<{ ok: true } | { ok: false; reason: "invalid-name" }>` (trim; empty/>40 → invalid).
- `setGroupGames(groupId, gameIds: string[]): Promise<{ ok: true }>` — replaces the group's tracked set with the given active game ids (delete-all-then-insert-valid).
- `resetInvite(groupId): Promise<{ token: string }>` — new token, stores the new hash (old link stops resolving).
- `getInviteToken` is NOT provided (the plaintext token is only returned at create/reset time; the route exposes the shareable link built from a freshly-reset or create-time token). Instead `groupInviteExists(groupId): Promise<boolean>` is provided so the UI can show "reset to get a link" if somehow absent.

- [ ] **Step 1: Failing tests** (append): renameGroup empty→invalid + valid updates; setGroupGames deletes then inserts only active ids; resetInvite returns a token and updates the hash.
```ts
describe("renameGroup", () => {
  it("empty → invalid-name, no update", async () => {
    expect(await renameGroup("g1", "  ")).toEqual({ ok: false, reason: "invalid-name" });
    expect(sqlMock).not.toHaveBeenCalled();
  });
  it("valid trims + updates", async () => {
    sqlMock.mockResolvedValueOnce([]);
    expect(await renameGroup("g1", " Fam ")).toEqual({ ok: true });
    expect(sqlMock.mock.calls[0].slice(1)).toContain("Fam");
  });
});
describe("setGroupGames", () => {
  it("clears then inserts", async () => {
    sqlMock.mockResolvedValue([]);
    await setGroupGames("g1", ["wordle"]);
    const texts = sqlMock.mock.calls.map((c) => String(c[0].join("?")));
    expect(texts[0]).toContain("DELETE FROM group_games");
    expect(texts.some((t) => t.includes("INSERT INTO group_games"))).toBe(true);
  });
});
describe("resetInvite", () => {
  it("returns a token and updates the hash", async () => {
    sqlMock.mockResolvedValueOnce([]);
    expect(await resetInvite("g1")).toEqual({ token: "tok" }); // per generateInviteToken mock
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** (append):
```ts
export async function renameGroup(
  groupId: string, name: string,
): Promise<{ ok: true } | { ok: false; reason: "invalid-name" }> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return { ok: false, reason: "invalid-name" };
  await sql`UPDATE groups SET name = ${trimmed} WHERE id = ${groupId}`;
  return { ok: true };
}

export async function setGroupGames(groupId: string, gameIds: string[]): Promise<{ ok: true }> {
  await sql`DELETE FROM group_games WHERE group_id = ${groupId}`;
  for (const gameId of gameIds) {
    await sql`INSERT INTO group_games (group_id, game_id) SELECT ${groupId}, id FROM games WHERE id = ${gameId} AND active = true ON CONFLICT DO NOTHING`;
  }
  return { ok: true };
}

export async function resetInvite(groupId: string): Promise<{ token: string }> {
  const { token, tokenHash } = generateInviteToken();
  await sql`UPDATE groups SET invite_token_hash = ${tokenHash} WHERE id = ${groupId}`;
  return { token };
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(groups): rename, setGroupGames, resetInvite"`

---

## Task 7: Group API routes — create/list + join/preview

**Files:** Create `src/app/api/groups/route.ts` (+ `groups.test.ts`), `src/app/api/groups/join/route.ts` (+ test), `src/app/api/groups/preview/route.ts` (+ test).

**Interfaces produced (HTTP):**
- `POST /api/groups` `{ name, gameIds }` → `requireUser` → `createGroup` → `201 { id, link }` (link = `${origin}/?join=${token}`) or `400`.
- `GET /api/groups` → `requireUser` → `{ groups: listMyGroups }`.
- `POST /api/groups/join` `{ token }` → `requireUser` → `joinViaToken` → `{ ok, groupId }` or `400 invalid-token`.
- `GET /api/groups/preview?token=` → `requireUser` → `groupPreviewByToken` → `{ group } | 404`.

- [ ] **Step 1: Failing tests** — one per route, mocking `@/lib/membership` (`requireUser`) and `@/lib/groups`. Assert: create 401 when guard fails, 400 on `{ok:false}`, 201 with `link` containing the token on success; list returns groups; join maps invalid-token→400 and success→200; preview 404 on null.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** Pattern (all `runtime = "nodejs"`). `POST /api/groups`:
```ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/membership";
import { createGroup, listMyGroups } from "@/lib/groups";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; gameIds?: unknown };
  const name = typeof body.name === "string" ? body.name : "";
  const gameIds = Array.isArray(body.gameIds) ? body.gameIds.filter((g): g is string => typeof g === "string") : [];
  const result = await createGroup(guard.viewer.userId, name, gameIds);
  if (!result.ok) return NextResponse.json({ error: "Enter a group name (1–40 characters)." }, { status: 400 });
  const origin = new URL(req.url).origin;
  return NextResponse.json({ id: result.id, link: `${origin}/?join=${result.token}` }, { status: 201 });
}
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  return NextResponse.json({ groups: await listMyGroups(guard.viewer.userId) });
}
```
`POST /api/groups/join`:
```ts
const guard = await requireUser(); if (!guard.ok) …;
const token = typeof body.token === "string" ? body.token : "";
if (!token) return NextResponse.json({ error: "Missing invite token" }, { status: 400 });
const r = await joinViaToken(guard.viewer.userId, token);
if (!r.ok) return NextResponse.json({ error: "This invite link is invalid." }, { status: 400 });
return NextResponse.json({ ok: true, groupId: r.groupId });
```
`GET /api/groups/preview`:
```ts
const guard = await requireUser(); if (!guard.ok) …;
const token = new URL(req.url).searchParams.get("token") ?? "";
const group = await groupPreviewByToken(token);
if (!group) return NextResponse.json({ error: "This invite link is invalid." }, { status: 404 });
return NextResponse.json({ group });
```

- [ ] **Step 4: Run** the three route tests → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(api): POST/GET /api/groups, /api/groups/join, /api/groups/preview"`

---

## Task 8: Group API routes — manage (rename/delete, games, remove member, leave, invite)

**Files:** Create `src/app/api/groups/[groupId]/route.ts` (+test), `…/games/route.ts` (+test), `…/members/[userId]/route.ts` (+test), `…/leave/route.ts` (+test), `…/invite/route.ts` (+test).

**Interfaces produced (HTTP):**
- `PATCH /api/groups/[groupId]` `{ name }` → `requireGroupAdmin` → `renameGroup` → `{ ok } | 400`.
- `DELETE /api/groups/[groupId]` → `requireGroupAdmin` → `DELETE FROM groups WHERE id=$` (cascades memberships/group_games) → `{ ok }`.
- `PUT /api/groups/[groupId]/games` `{ gameIds }` → `requireGroupAdmin` → `setGroupGames` → `{ ok }`.
- `DELETE /api/groups/[groupId]/members/[userId]` → `requireGroupAdmin` → `removeMember` → `{ ok }`. (Admin removing themselves is allowed and triggers reconciliation; the UI uses Leave for self.)
- `POST /api/groups/[groupId]/leave` → `requireMember` → `leaveGroup` → `{ ok }`.
- `POST /api/groups/[groupId]/invite` → `requireGroupAdmin` → `resetInvite` → `{ link }` (built from origin + token).

- [ ] **Step 1: Failing tests** — for each: 403 when the guard fails (non-admin/non-member), success path returns the expected body. Assert the DELETE-group route calls `requireGroupAdmin` (not just `requireUser`) and the leave route calls `requireMember`. For invite, assert the returned `link` contains the reset token.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** Each handler: resolve `params.groupId` (and `params.userId`), call the matching guard, then the `groups.ts` function. Example `PATCH/DELETE [groupId]/route.ts`:
```ts
export async function PATCH(req: Request, { params }: { params: { groupId: string } }) {
  const guard = await requireGroupAdmin(params.groupId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const result = await renameGroup(params.groupId, typeof body.name === "string" ? body.name : "");
  if (!result.ok) return NextResponse.json({ error: "Enter a group name (1–40 characters)." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
export async function DELETE(_req: Request, { params }: { params: { groupId: string } }) {
  const guard = await requireGroupAdmin(params.groupId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  await sql`DELETE FROM groups WHERE id = ${params.groupId}`;
  return NextResponse.json({ ok: true });
}
```
`invite/route.ts` builds `link: ${new URL(req.url).origin}/?join=${(await resetInvite(params.groupId)).token}`.

- [ ] **Step 4: Run** all five route tests → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(api): group manage routes (rename/delete/games/remove-member/leave/invite-reset)"`

---

## Task 9: Group-scoped board reads (`?group=`)

**Files:** Modify `leaderboard/route.ts`, `me/route.ts`, `games/route.ts`, `games/[gameId]/board/route.ts` (+ their tests).

**Behavior:** each route reads `const groupId = new URL(req.url).searchParams.get("group")`. If absent → the Phase 1 global path unchanged (`requireUser`). If present → `requireMember(groupId)` (403 for non-members), and the entry/game queries additionally filter to the group:
- membership filter: `AND e.user_id IN (SELECT user_id FROM memberships WHERE group_id = ${groupId})`
- tracked-games filter: `AND e.game_id IN (SELECT gg.game_id FROM group_games gg JOIN games ga ON ga.id = gg.game_id AND ga.active = true WHERE gg.group_id = ${groupId})`
- `games` list route (used to render the picker/board tabs): if `group` present, `SELECT … FROM games g JOIN group_games gg ON gg.game_id = g.id AND gg.group_id = ${groupId} WHERE g.active = true ORDER BY name`.
- **No-peek unchanged:** it stays computed over the viewer's GLOBAL play for the day (the viewer's own `user_id` rows), so a member's lock state is consistent across boards. Do NOT scope the no-peek "played today" set to the group.

- [ ] **Step 1: Failing tests** — for each route add cases: (a) no `group` → global (existing behavior preserved, `requireUser`); (b) `group=g1` non-member → 403 (`requireMember` mock returns not-ok); (c) `group=g1` member → query text includes the memberships + group_games subqueries. Assert no-peek still keys on the viewer's userId (unchanged).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** each route: branch the guard on `groupId`, and conditionally append the two filters to the entries query (and swap the `games` list query). Keep the global query identical when `groupId` is absent. Example guard branch:
```ts
const groupId = new URL(req.url).searchParams.get("group");
const guard = groupId ? await requireMember(groupId) : await requireUser();
if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
```
Build the entries query with the optional filters (use a conditional fragment or two query variants — the neon tagged-template doesn't compose fragments, so write the two full queries in an `if (groupId) { … } else { … }`). Keep both paths' column lists identical so the downstream scoring mapping is unchanged.

- [ ] **Step 4: Run** all four route tests → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(reads): optional ?group= scoping on leaderboard/me/games/board (member-gated, members × tracked-active games)"`

---

## Task 10: Client fns + folded Phase 1 minors

**Files:** Modify `src/lib/api.ts` (+ `api.test.ts` if present); `src/app/api/onboarding/route.ts` (+ test); `src/app/api/admin/games/games.test.ts`.

- [ ] **Step 1: Failing tests** — `api.test.ts`: the new client fns hit the right URLs/methods; the read fns append `&group=` when a groupId is passed. onboarding: a >40-char name → 400 (new cap). admin/games: restore the removed 401 (guard fail), 422 (invalid game), 409 (duplicate id) cases.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.**
Client fns in `api.ts`:
```ts
export function createGroup(name: string, gameIds: string[]): Promise<ApiResult<{ id: string; link: string }>> {
  return request("/api/groups", jsonPost({ name, gameIds }));
}
export function listMyGroups(): Promise<ApiResult<{ groups: { id: string; name: string; role: "admin" | "member" }[] }>> {
  return request("/api/groups");
}
export function joinGroup(token: string): Promise<ApiResult<{ ok: true; groupId: string }>> {
  return request("/api/groups/join", jsonPost({ token }));
}
export function getGroupPreview(token: string): Promise<ApiResult<{ group: { id: string; name: string; memberCount: number; gameCount: number } }>> {
  return request(`/api/groups/preview?token=${encodeURIComponent(token)}`);
}
export function renameGroup(groupId: string, name: string): Promise<ApiResult<{ ok: true }>> {
  return request(`/api/groups/${encodeURIComponent(groupId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
}
export function deleteGroup(groupId: string): Promise<ApiResult<{ ok: true }>> {
  return request(`/api/groups/${encodeURIComponent(groupId)}`, { method: "DELETE" });
}
export function setGroupGames(groupId: string, gameIds: string[]): Promise<ApiResult<{ ok: true }>> {
  return request(`/api/groups/${encodeURIComponent(groupId)}/games`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameIds }) });
}
export function removeMember(groupId: string, userId: string): Promise<ApiResult<{ ok: true }>> {
  return request(`/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
}
export function leaveGroup(groupId: string): Promise<ApiResult<{ ok: true }>> {
  return request(`/api/groups/${encodeURIComponent(groupId)}/leave`, jsonPost({}));
}
export function resetGroupInvite(groupId: string): Promise<ApiResult<{ link: string }>> {
  return request(`/api/groups/${encodeURIComponent(groupId)}/invite`, jsonPost({}));
}
```
Add an optional `group` param to `getLeaderboard`, `getBoard`, `getMe`, `getGames` (append `params.set("group", group)` when provided; `getGames` gains a `group?` arg → `/api/games?group=`).
onboarding: add `if (displayName.length > 40) return NextResponse.json({ error: "Name must be 40 characters or fewer" }, { status: 400 });` after the empty check.
admin/games test: re-add the 401/422/409 cases.

- [ ] **Step 4: Run** `npm test` (full) → PASS; then `npm run typecheck && npm run lint && DATABASE_URL='postgres://u:p@localhost/db' AUTH_SECRET='x-at-least-32-bytes-xxxxxxxxxxxxxx' npm run build`.
- [ ] **Step 5: Commit** — `git commit -am "feat(client): group API client fns + ?group reads; onboarding 40-char cap; restore admin/games test coverage"`

---

## Self-review

**Spec coverage (Phase 2 backend):** memberships (T1), group_games (T1), invite hash on groups (T1), requireMember/requireGroupAdmin (T2), createGroup+list (T3), join idempotent+preview (T4), leave auto-promote+last-member-delete + removeMember (T5), rename/set-games/reset-invite (T6), all API routes (T7,T8), group-scoped reads member-gated + members×tracked-active + no-peek-stays-global (T9), client fns + group params (T10). Folded minors: onboarding 40-cap (T10), isUniqueViolation shared (T1), admin/games coverage (T10). ✓
**Not in 2a (→ Phase 2b):** board-switcher dropdown, overflow menu, create/join/manage screens, AppShell board-context wiring, `?join=` handling.
**Concurrency:** join idempotent via `UNIQUE(group_id,user_id)`+23505; leave/remove promote is a single conditional UPDATE (no-op if an admin exists), delete-group a single conditional DELETE — both re-runnable, no interactive txn. ✓
**Authz:** every mutating route guarded; group reads `requireMember`; manage `requireGroupAdmin`; server-derived role only. ✓
**Type consistency:** `createGroup`→`{ok,id,token}`; route builds `link`; client `createGroup`→`{id,link}`; `listMyGroups` row `{id,name,role}` consistent lib↔route↔client. Guards return the Phase 1 `GuardResult`. `joinViaToken` 23505 constraint name `memberships_group_id_user_id_key` must match the schema's `UNIQUE(group_id,user_id)` default name — the implementer verifies the generated name (Task 4 note).

## Deploy note
This branch stacks on Phase 1; it deploys in the same coordinated release. Its additive DDL (`memberships`, `group_games`, `groups.invite_token_hash`, and the `groups` legacy-column relaxations) is applied to prod at the same gated migration step as Phase 1 (before the code deploys). No destructive drops here (those remain in the deferred Phase 1 Task 12 PR). No prod change without the owner's explicit go-ahead.
