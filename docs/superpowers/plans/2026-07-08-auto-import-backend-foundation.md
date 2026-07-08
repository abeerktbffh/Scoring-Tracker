# Auto-Import — Backend Foundation (Piece 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated *token* (not just a browser session) log a result through the existing `POST /api/entries`, so future capture clients (Android PWA, iOS Shortcut, native app) can submit `{rawInput}` on a user's behalf.

**Architecture:** Additive. Add a hash-only per-user import token (`users.import_token_hash`), a tiny token lib (reusing the invite-token SHA-256 hashing), a `requireUserOrImportToken(req)` guard that accepts an `Authorization: Bearer <token>` header else falls back to the session, wire that guard into the unchanged `/api/entries` write path, add a best-effort per-user rate-limit on the token path, and a `POST /api/me/import-token` route to mint/rotate the token. No parser, ranking, or write-path changes.

**Tech Stack:** Next.js 14.2 App Router (route handlers, `runtime = "nodejs"`), TypeScript, Neon Postgres via the stateless `sql` tagged-template client, Vitest.

## Global Constraints

- **Reuse, don't reinvent.** `POST /api/entries` already does `{rawInput}` → `resolveSubmission` → `detectAndParse` → `supersedeAndInsert` (dedup/supersede/`23505`-retry). Do NOT add a parallel endpoint or duplicate that logic. Only the auth guard changes.
- **The ranking scalar is unchanged.** `parsed_value`/`solved` and the write path are untouched; this is purely an additional auth mode.
- **Token is a write-capable bearer credential → hash-only.** Store ONLY `import_token_hash`. Plaintext is returned to the caller once at generation and never persisted or re-displayable. This is DELIBERATELY different from the group invite token (which stores plaintext because it's low-sensitivity). Reuse the *hashing* (`hashInviteToken`, SHA-256 of a 144-bit `randomBytes(18)` base64url token) — not the storage pattern.
- **Neon stateless driver:** no interactive transactions / no `FOR UPDATE`; parameterize via the `sql` tagged template (never string-concat).
- **`scripts/migrate.mjs` applies `src/db/schema.sql` by splitting on `;`. NEVER put a `;` inside a `--` comment** (this has broken prod migrations twice). All DDL is idempotent (`IF NOT EXISTS`).
- **Deploy is gated** (backup → migrate the token column → merge) and needs the owner's explicit go-ahead. Do NOT run anything under `scripts/`.
- Blast radius of a leaked token is low by design (write-only, no read/account access, each write bounded by the per-day supersede) — state this; the rate-limit is a best-effort speed-bump, not hard protection (the in-memory limiter is per-instance).

---

## File Structure

- **Create** `src/lib/importToken.ts` — mint + hash the import token (Task 2).
- **Create** `src/lib/importToken.test.ts` — its unit tests (Task 2).
- **Modify** `src/db/schema.sql` — additive `users.import_token_hash` column + unique partial index (Task 1).
- **Modify** `src/lib/membership.ts` — `resolveViewerByImportToken` + `requireUserOrImportToken(req)` (Task 3).
- **Modify** `src/lib/membership.test.ts` — tests for the two new functions (Task 3).
- **Modify** `src/app/api/entries/route.ts` — swap the guard to `requireUserOrImportToken(req)`, add token-path rate-limit (Task 4).
- **Modify** `src/app/api/entries/entries.test.ts` — token-auth path tests (Task 4).
- **Create** `src/app/api/me/import-token/route.ts` — mint/rotate route (Task 5).
- **Create** `src/app/api/me/import-token/importToken.route.test.ts` — its tests (Task 5).

---

## Task 1: Schema — `users.import_token_hash` (additive)

**Files:**
- Modify: `src/db/schema.sql` (append at end, after the leaderboard `detail` block)

**Interfaces:**
- Produces: a nullable `users.import_token_hash TEXT` column + `users_import_token_hash_uq` unique partial index. Consumed by Tasks 2/3/5.

- [ ] **Step 1: Append the DDL to `src/db/schema.sql`**

Append exactly these lines at the end of the file (mirrors the `groups` invite-token pattern at lines 101–102). NOTE: no `;` appears in any comment line.

```sql
-- === Auto-import: per-user import token (hash-only, write-capable bearer credential) ===
-- Stores ONLY the SHA-256 hash of the token. Plaintext is returned once at
-- generation and never persisted. Unique so a token resolves to at most one user.
ALTER TABLE users ADD COLUMN IF NOT EXISTS import_token_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_import_token_hash_uq ON users (import_token_hash) WHERE import_token_hash IS NOT NULL;
```

- [ ] **Step 2: Verify no `;` in comments and the split is clean**

Run:
```bash
grep -n '^--.*;' src/db/schema.sql && echo "FOUND semicolon-in-comment (FAIL)" || echo "OK: no semicolon in comments"
node -e "const s=require('fs').readFileSync('src/db/schema.sql','utf8');const n=s.split(';').map(x=>x.trim()).filter(Boolean).length;console.log('statements:',n)"
```
Expected: `OK: no semicolon in comments`, and the statement count printed with no error.

- [ ] **Step 3: Confirm the full suite still passes (schema edit shouldn't affect tests)**

Run: `npx vitest run`
Expected: all pass (no new tests here — this is DDL; do NOT run `scripts/migrate.mjs`).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.sql
git commit -m "feat(db): add users.import_token_hash (hash-only per-user import token)"
```

---

## Task 2: Import-token lib

**Files:**
- Create: `src/lib/importToken.ts`
- Test: `src/lib/importToken.test.ts`

**Interfaces:**
- Consumes: `hashInviteToken` from `src/lib/inviteToken.ts` (SHA-256 hex).
- Produces: `hashImportToken(token: string): string` and `generateImportToken(): { token: string; tokenHash: string }`. Consumed by Tasks 3 & 5.

- [ ] **Step 1: Write the failing test**

Create `src/lib/importToken.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { generateImportToken, hashImportToken } from "./importToken";

describe("importToken", () => {
  it("hashImportToken is SHA-256 hex and deterministic", () => {
    const h = hashImportToken("abc");
    expect(h).toBe(createHash("sha256").update("abc").digest("hex"));
    expect(hashImportToken("abc")).toBe(h);
  });

  it("generateImportToken returns a url-safe token whose hash matches", () => {
    const { token, tokenHash } = generateImportToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/); // base64url, ~24 chars
    expect(tokenHash).toBe(hashImportToken(token));
  });

  it("generateImportToken is unique across calls", () => {
    expect(generateImportToken().token).not.toBe(generateImportToken().token);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/importToken.test.ts`
Expected: FAIL — cannot resolve `./importToken`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/importToken.ts`:
```ts
import { randomBytes } from "node:crypto";
import { hashInviteToken } from "./inviteToken";

/** SHA-256 hex hash of an import token (reuses the invite-token hashing). */
export function hashImportToken(token: string): string {
  return hashInviteToken(token);
}

/**
 * Mint a new import token: a 144-bit random, url-safe (~24 char) token plus its
 * hash. The plaintext `token` is shown to the caller ONCE; only `tokenHash` is
 * ever stored.
 */
export function generateImportToken(): { token: string; tokenHash: string } {
  const token = randomBytes(18).toString("base64url");
  return { token, tokenHash: hashImportToken(token) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/importToken.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/importToken.ts src/lib/importToken.test.ts
git commit -m "feat(auth): import-token lib (hash-only, reuses invite-token hashing)"
```

---

## Task 3: Token resolution + `requireUserOrImportToken` guard

**Files:**
- Modify: `src/lib/membership.ts`
- Test: `src/lib/membership.test.ts`

**Interfaces:**
- Consumes: `hashImportToken` (Task 2); existing `sql`, `Viewer`, `GuardResult`, `toGuardResult`, `requireUser` in this file.
- Produces:
  - `resolveViewerByImportToken(token: string): Promise<Viewer | null>`
  - `requireUserOrImportToken(req: Request): Promise<GuardResult>` — bearer header → token viewer (401 if unknown); no bearer → delegates to `requireUser()`. Consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/membership.test.ts` (follow the file's existing mock style; it already mocks `@/db/client`'s `sql`). Add a `describe`:
```ts
import { resolveViewerByImportToken, requireUserOrImportToken } from "./membership";

describe("import-token auth", () => {
  it("resolveViewerByImportToken returns the viewer for a known token", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "u9", display_name: "Dev", is_super_admin: false }]);
    const v = await resolveViewerByImportToken("tok");
    expect(v).toEqual({ userId: "u9", displayName: "Dev", isSuperAdmin: false });
  });

  it("resolveViewerByImportToken returns null for an unknown token", async () => {
    sqlMock.mockResolvedValueOnce([]);
    expect(await resolveViewerByImportToken("nope")).toBeNull();
  });

  it("requireUserOrImportToken: valid bearer → ok viewer", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "u9", display_name: "Dev", is_super_admin: false }]);
    const req = new Request("http://x/api/entries", { headers: { authorization: "Bearer tok" } });
    const g = await requireUserOrImportToken(req);
    expect(g).toEqual({ ok: true, viewer: { userId: "u9", displayName: "Dev", isSuperAdmin: false } });
  });

  it("requireUserOrImportToken: unknown bearer → 401, never falls through to session", async () => {
    sqlMock.mockResolvedValueOnce([]);
    const req = new Request("http://x/api/entries", { headers: { authorization: "Bearer bad" } });
    const g = await requireUserOrImportToken(req);
    expect(g).toEqual({ ok: false, status: 401, error: "Unauthenticated" });
  });

  it("requireUserOrImportToken: no bearer → delegates to the session path", async () => {
    // No Authorization header → resolveViewer() runs; with no session it 401s.
    const req = new Request("http://x/api/entries");
    const g = await requireUserOrImportToken(req);
    expect(g.ok).toBe(false);
  });
});
```
> Note for the implementer: `src/lib/membership.test.ts` already declares `sqlMock` and `vi.mock("@/db/client", …)`. If the no-bearer test needs a null session, ensure `@/auth/config`'s `auth` is mocked to return `{}`/undefined as the file already does for its `resolveViewer` tests; reuse that existing mock rather than adding a new one.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/membership.test.ts`
Expected: FAIL — `resolveViewerByImportToken`/`requireUserOrImportToken` not exported.

- [ ] **Step 3: Implement in `src/lib/membership.ts`**

Add the import at the top (next to the existing `import { sql } from "@/db/client";`):
```ts
import { hashImportToken } from "@/lib/importToken";
```
Add these two functions (after `requireUser`):
```ts
/**
 * Resolves a viewer from a raw import token by its hash. DB is the source of
 * truth (name/super-admin read fresh), exactly like `resolveViewer`. Returns
 * null when the token matches no user.
 */
export async function resolveViewerByImportToken(token: string): Promise<Viewer | null> {
  const hash = hashImportToken(token);
  const rows = (await sql`
    SELECT id, display_name, is_super_admin FROM users WHERE import_token_hash = ${hash}
  `) as { id: string; display_name: string | null; is_super_admin: boolean }[];
  const row = rows[0];
  if (!row) return null;
  return { userId: row.id, displayName: row.display_name ?? null, isSuperAdmin: row.is_super_admin ?? false };
}

const BEARER_RE = /^Bearer\s+(\S+)$/i;

/**
 * Guard for endpoints reachable by either a browser session OR a per-user
 * import token. An `Authorization: Bearer <token>` header is resolved via the
 * token (unknown token → 401, never a silent session fallthrough); with no
 * bearer header it delegates to the session guard `requireUser()`.
 */
export async function requireUserOrImportToken(req: Request): Promise<GuardResult> {
  const m = req.headers.get("authorization")?.match(BEARER_RE);
  if (m) return toGuardResult(await resolveViewerByImportToken(m[1]), "user");
  return requireUser();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/membership.test.ts`
Expected: PASS (existing tests + 5 new).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` (expect 0 errors)
```bash
git add src/lib/membership.ts src/lib/membership.test.ts
git commit -m "feat(auth): requireUserOrImportToken guard + token viewer resolution"
```

---

## Task 4: Accept the token at `POST /api/entries`

**Files:**
- Modify: `src/app/api/entries/route.ts`
- Test: `src/app/api/entries/entries.test.ts`

**Interfaces:**
- Consumes: `requireUserOrImportToken` (Task 3), existing `rateLimit` (`src/lib/rateLimit.ts`).
- Produces: no new exports — the route now authenticates via session OR token, with a best-effort per-user rate-limit on the token path.

- [ ] **Step 1: Update the failing tests first**

In `src/app/api/entries/entries.test.ts`:
1. Change the guard mock from `requireUser` to `requireUserOrImportToken`:
```ts
vi.mock("@/lib/membership", () => ({ requireUserOrImportToken: guardMock }));
```
2. Add token-path tests inside `describe("POST /api/entries", …)`:
```ts
it("logs via a valid import token (bearer) using the shared write path", async () => {
  guardMock.mockResolvedValue(USER_VIEWER);
  resolveSubmissionMock.mockReturnValue(RESOLVED_SUBMISSION);
  sqlMock
    .mockResolvedValueOnce([{ id: "wordle" }]) // game exists
    .mockResolvedValueOnce([])                 // prior lookup (none)
    .mockResolvedValueOnce(undefined);         // insert
  const req = new Request("http://localhost/api/entries", {
    method: "POST",
    headers: { authorization: "Bearer tok" },
    body: JSON.stringify({ rawInput: "Wordle 999 4/6" }),
  });
  const res = await POST(req);
  expect(res.status).toBe(200);
});

it("429s a token caller past the per-user limit", async () => {
  guardMock.mockResolvedValue(USER_VIEWER);
  resolveSubmissionMock.mockReturnValue(RESOLVED_SUBMISSION);
  sqlMock.mockResolvedValue([{ id: "wordle" }]); // permissive for game check
  const mk = () => new Request("http://localhost/api/entries", {
    method: "POST",
    headers: { authorization: "Bearer tok" },
    body: JSON.stringify({ rawInput: "x" }),
  });
  let last = 200;
  for (let i = 0; i < 31; i++) last = (await POST(mk())).status;
  expect(last).toBe(429);
});
```
> The 429 test relies on the real in-memory `rateLimit` (do NOT mock it) keyed by `USER_VIEWER.viewer.userId`. Keep `USER_VIEWER.viewer.userId` stable so the 31 hits share a key.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/app/api/entries/entries.test.ts`
Expected: FAIL — route still imports `requireUser`; no rate-limit → no 429.

- [ ] **Step 3: Implement the route change**

In `src/app/api/entries/route.ts`:
1. Swap the import:
```ts
import { requireUserOrImportToken } from "@/lib/membership";
```
```ts
import { rateLimit } from "@/lib/rateLimit";
```
2. Replace the guard call + add the token-path limit at the top of `POST`:
```ts
export async function POST(req: Request) {
  const guard = await requireUserOrImportToken(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const userId = guard.viewer.userId;

  // Best-effort speed-bump for the token path only. In-memory/per-instance —
  // NOT hard protection; blast radius is low (write-only, per-day supersede).
  if (req.headers.get("authorization") && !rateLimit(`import:${userId}`, 30, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many imports — try again shortly" }, { status: 429 });
  }
  // ...rest of the handler is UNCHANGED (body parse → resolveSubmission → game check → supersedeAndInsert)
```
Leave everything below unchanged.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/app/api/entries/entries.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Typecheck, full suite, commit**

Run: `npx tsc --noEmit` (0 errors) and `npx vitest run` (all pass)
```bash
git add src/app/api/entries/route.ts src/app/api/entries/entries.test.ts
git commit -m "feat(entries): accept per-user import token (bearer) + token-path rate-limit"
```

---

## Task 5: Mint/rotate route — `POST /api/me/import-token`

**Files:**
- Create: `src/app/api/me/import-token/route.ts`
- Test: `src/app/api/me/import-token/importToken.route.test.ts`

**Interfaces:**
- Consumes: `requireUser` (session-only — you manage your OWN token), `generateImportToken` (Task 2), `sql`.
- Produces: `POST` handler returning `{ token }` (plaintext, ONCE) and persisting only the hash.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/me/import-token/importToken.route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const guardMock = vi.fn();
const sqlMock = vi.fn();
vi.mock("@/lib/membership", () => ({ requireUser: guardMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

const { POST } = await import("./route");
beforeEach(() => vi.clearAllMocks());

describe("POST /api/me/import-token", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    guardMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });
    const res = await POST();
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("mints a token, stores only the hash, returns the plaintext once", async () => {
    guardMock.mockResolvedValue({ ok: true, viewer: { userId: "u1", displayName: "A", isSuperAdmin: false } });
    sqlMock.mockResolvedValue(undefined);
    const res = await POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(19);
    // The UPDATE must bind the HASH, not the plaintext token.
    const call = sqlMock.mock.calls[0];
    expect(call.slice(1)).not.toContain(body.token);
  });

  it("rotates: two calls yield different tokens", async () => {
    guardMock.mockResolvedValue({ ok: true, viewer: { userId: "u1", displayName: "A", isSuperAdmin: false } });
    sqlMock.mockResolvedValue(undefined);
    const t1 = await (await POST()).json();
    const t2 = await (await POST()).json();
    expect(t1.token).not.toBe(t2.token);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/app/api/me/import-token/importToken.route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement the route**

Create `src/app/api/me/import-token/route.ts`:
```ts
import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireUser } from "@/lib/membership";
import { generateImportToken } from "@/lib/importToken";

export const runtime = "nodejs";

/**
 * Mints (or rotates) the caller's import token. Returns the plaintext token
 * ONCE; only its hash is stored. Calling again revokes the previous token.
 * Session-only (you manage your own token) — no import-token auth here.
 */
export async function POST() {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { token, tokenHash } = generateImportToken();
  await sql`UPDATE users SET import_token_hash = ${tokenHash} WHERE id = ${guard.viewer.userId}`;
  return NextResponse.json({ token });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/app/api/me/import-token/importToken.route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck, full suite, build, commit**

Run: `npx tsc --noEmit` (0), `npx vitest run` (all pass), `npm run build` (succeeds)
```bash
git add src/app/api/me/import-token/route.ts src/app/api/me/import-token/importToken.route.test.ts
git commit -m "feat(api): POST /api/me/import-token to mint/rotate the import token"
```

---

## Deploy (gated — owner go-ahead required)

Code-plus-one-additive-migration, same discipline as prior releases:
1. **Backup** — tag current `main`; note a Neon PITR point.
2. **Migrate** — apply `schema.sql` (adds `users.import_token_hash` + index) to prod via `scripts/migrate.mjs`. Additive/idempotent; old code unaffected (new column unused until this ships).
3. **Merge** the PR → prod auto-deploys.

No backfill. Nothing to prod without the owner's explicit go-ahead.

## Out of scope (this plan)

- **Android capture** (PWA `share_target` + handler) → Piece 2, its own plan.
- **iOS Shortcut + guided "Set up auto-log" settings UX** → Piece 3, its own plan.
- **Per-game mobile share-payload enumeration** → Piece 2/3 pre-flight (the backend is payload-agnostic; it just takes `{rawInput}`).
- Live board updates (roadmap B); native app (future — this token is its auth foundation).

## Self-Review

- **Spec coverage (Piece 1 scope):** token storage hash-only ✓ (Task 1, Global Constraints); token lib reusing invite hashing ✓ (Task 2); `requireUserOrImportToken` guard ✓ (Task 3); extend `/api/entries` (no new endpoint) ✓ (Task 4); per-token rate-limit with documented weakness ✓ (Task 4 + Global Constraints); mint/rotate route ✓ (Task 5). Pieces 2/3 explicitly deferred.
- **Placeholder scan:** none — every code/test/command step is concrete.
- **Type consistency:** `Viewer` shape `{ userId, displayName, isSuperAdmin }` matches `membership.ts`; `resolveViewerByImportToken`/`requireUserOrImportToken`/`generateImportToken`/`hashImportToken` names are used identically across Tasks 2–5; the entries route keeps its existing `supersedeAndInsert`/`resolveSubmission` contract unchanged.
