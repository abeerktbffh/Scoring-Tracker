# Identity Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. This is a **security-sensitive** workstream — the per-task and final reviews are security-focused, and the binding requirements in Global Constraints are non-negotiable.

**Goal:** Replace shared-passphrase + per-user PIN auth with Auth.js-based per-person identity (Google + email/password), invite-gated joining, admin-approved claim migration of existing players, per-person admin role, PIN removal, and real sign-out — for the single group `g1`.

**Architecture:** Auth.js (next-auth v5) on the App Router with a **custom adapter over the existing Neon `sql` client** and a **JWT session carrying only `userId`**. Membership and admin role are always re-resolved from the DB per privileged request. A `players` row is a user's group membership; existing players are migrated by an admin-approved, self-retiring **claim** flow. Schema changes are additive in `src/db/schema.sql` (applied by `scripts/migrate.mjs`); old auth is dropped only at cutover.

**Tech Stack:** Next.js 14.2 App Router, `next-auth@^5` (Auth.js) + `@auth/core`, `jose` (present), Neon Postgres (`@neondatabase/serverless`), Resend (email), scrypt (`node:crypto`), Vitest + Testing Library.

## Global Constraints

- **DB is source of truth.** The session token carries ONLY `userId`. Membership (the user's `player` in `g1`) and `is_admin` are read from the DB on **every** privileged request — never trusted from the token.
- **Server-side authorization on every mutating endpoint.** `POST /api/entries` and `POST /api/admin/*` each independently verify (a) authenticated session, (b) resolved `g1` membership, (c) `is_admin` for admin routes. **Entries are attributed to the server-resolved player; any client-supplied player id/displayName is ignored.** UI gating is cosmetic only.
- **Claim authorization.** A claim of a legacy player is created **pending** and transfers **no history until an admin approves it**. Claims are audited (`claimed_by_user_id`, `claim_status`, `claimed_at`, `approved_by`) and reversible. An invite is a *join* gate, never proof of identity. Claim approval is **migration-only** — it exists only while unclaimed, unarchived legacy players remain, then self-retires.
- **Account linking.** Auto-link a Google and an email/password login into ONE `user` **only on a matching, provably-verified email on both sides**; never on an unverified email. Enforce **one player per (user, group)**: `UNIQUE (group_id, user_id) WHERE user_id IS NOT NULL`.
- **Invite tokens** are cryptographically random, **stored hashed** (looked up by hash, constant-time compare, never stored raw), expiring (TTL) and revocable. Invite state never affects an already-joined account.
- **Password hashing:** scrypt with EXPLICIT params `N=32768, r=8, p=1, keylen=64`, random 16-byte salt, `timingSafeEqual` compare. Never store plaintext.
- **Verification & reset tokens:** single-use, short-TTL, invalidated on use; verification/reset **sends are rate-limited**; "forgot password" is **enumeration-safe** (identical response whether or not the email exists). CSRF handled within Auth.js routes.
- **Permanent admin join-notification:** email the admin whenever a player joins (claim approved OR fresh player created), ongoing after migration.
- **Migration ordering:** additive first (add columns/tables, `players.pin_hash DROP NOT NULL`, `players.archived`); the old passphrase/PIN write path is **disabled in production the moment the new flow goes live**; `groups.passphrase_hash`/`admin_passphrase_hash` and `players.pin_hash` are dropped at cutover after verification.
- **Secret-free build.** Auth.js, Google, and Resend must no-op/guard when their env vars are unset so `next build` + CI stay secret-free. Keep the existing test suite green.
- **Scope:** single group `g1` only. Build identity + invite primitives; NO multi-group creation/switching UI (workstream C).
- **Env vars (server-only):** `AUTH_SECRET` (present), `AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFY_EMAIL`.
- **Spec:** `docs/superpowers/specs/2026-07-03-identity-rebuild-design.md` — the "Security decisions" section is binding.

---

## File Structure

- `src/db/schema.sql` — additive schema (Auth.js tables + players/claims/invites changes). Applied via `scripts/migrate.mjs`.
- `src/auth/password.ts` — scrypt hash/verify with explicit params (new; leaves legacy `hash.ts` untouched until cutover).
- `src/auth/adapter.ts` — custom Auth.js `Adapter` over `sql`.
- `src/auth/config.ts` — Auth.js config (providers, adapter, callbacks, session). Exports `handlers`, `auth`, `signIn`, `signOut`.
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handlers.
- `src/lib/invites.ts` — invite token gen/hash/validate/redeem.
- `src/lib/claims.ts` — legacy-player claim lifecycle + archive.
- `src/lib/membership.ts` — `resolveViewer(session)` → membership/admin from DB; `requireMember`/`requireAdmin`.
- `src/lib/email.ts` — Resend sender (verification, reset, admin-notify); no-ops without key.
- `src/lib/rateLimit.ts` — simple per-key rate limiter for email sends.
- API routes: modify `src/app/api/entries/route.ts`, `src/app/api/admin/**`; add `src/app/api/invites/**`, `src/app/api/onboarding/**` (claim/create), `src/app/api/admin/claims/**`.
- UI (Bragboard design system from workstream B — reuse tokens + components): replace `src/components/SignInGate.tsx`; add invite/need-invite/onboarding screens under `src/app/(app)/` and the unauthenticated area; extend `src/app/(app)/admin/page.tsx` (claims queue + invites); functional Sign out in `src/components/Drawer.tsx`; simplify `src/app/(app)/log/page.tsx` (drop name/PIN).

**DB migrations are a guided step**, not a subagent action: after a task edits `schema.sql`, the controller/owner runs `set -a && . ./.env.local && set +a && node scripts/migrate.mjs` against the **preview** Neon branch first, then production at cutover. Subagents never run DB commands.

---

### Task 1: Additive schema migration

**Files:** Modify `src/db/schema.sql` (append idempotent statements — no multi-statement functions, since `migrate.mjs` splits on `;`).

**Interfaces — Produces:** tables `users`, `accounts`, `verification_token`; `players.user_id`/`is_admin`/`archived`; `players.pin_hash` nullable; tables `claims`, `invites`; uniqueness constraints.

- [ ] **Step 1: Append the schema** (Auth.js-compatible shapes; all `IF NOT EXISTS`):

```sql
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

-- === Invites (join gate; store token HASH only) ===
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
```

- [ ] **Step 2: Verify statements are single-statement-safe** — Run: `node -e "const s=require('fs').readFileSync('src/db/schema.sql','utf8');const n=s.split(';').map(x=>x.trim()).filter(Boolean).length;console.log('statements:',n)"`. Expected: prints a count, no error (every statement is simple; no `$$`/`DO` blocks).
- [ ] **Step 3: Typecheck/lint/test/build** — Run: `npm run typecheck && npm run lint && npm test && npm run build`. Expected: all green (no code changed).
- [ ] **Step 4: Commit** — `git add src/db/schema.sql && git commit -m "feat(db): additive identity schema (users/accounts/verification_token, players membership cols, claims, invites)"`
- [ ] **Step 5 (GUIDED — controller/owner, not the implementer):** apply to the **preview** Neon branch: `set -a && . ./.env.local.preview && set +a && node scripts/migrate.mjs` (or the preview DATABASE_URL). Confirm tables exist. Production apply happens at cutover (Task 20).

---

### Task 2: Password hashing (explicit scrypt params)

**Files:** Create `src/auth/password.ts`, `src/auth/password.test.ts`.

**Interfaces — Produces:** `hashPassword(pw: string): Promise<string>` (returns `scrypt$N$r$p$salthex$hashhex`), `verifyPassword(pw: string, stored: string): Promise<boolean>` (constant-time; returns false on malformed input).

- [ ] **Step 1: Failing test** `src/auth/password.test.ts` (node env):
```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";
describe("password hashing", () => {
  it("round-trips and encodes explicit params", async () => {
    const h = await hashPassword("s3cret!");
    expect(h.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("s3cret!", h)).toBe(true);
  });
  it("rejects wrong password and malformed hashes", async () => {
    const h = await hashPassword("right");
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});
```
- [ ] **Step 2: Run — FAIL.** `npx vitest run src/auth/password.test.ts`
- [ ] **Step 3: Implement** `src/auth/password.ts`:
```ts
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scryptAsync = promisify(scrypt);
const N = 32768, r = 8, p = 1, KEYLEN = 64;
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const dk = (await scryptAsync(pw, salt, KEYLEN, { N, r, p, maxmem: 128 * N * r * 2 })) as Buffer;
  return `scrypt$${N}$${r}$${p}$${salt}$${dk.toString("hex")}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, ns, rs, ps, salt, hashHex] = parts;
  const nN = Number(ns), nr = Number(rs), np = Number(ps);
  if (!nN || !nr || !np || !salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const dk = (await scryptAsync(pw, salt, expected.length, { N: nN, r: nr, p: np, maxmem: 128 * nN * nr * 2 })) as Buffer;
  return expected.length === dk.length && timingSafeEqual(expected, dk);
}
```
- [ ] **Step 4: Run — PASS.** **Step 5: Commit** — `git add src/auth/password.ts src/auth/password.test.ts && git commit -m "feat(auth): password hashing with explicit scrypt params"`

---

### Task 3: Invite tokens

**Files:** Create `src/lib/invites.ts`, `src/lib/invites.test.ts`.

**Interfaces — Produces:** `newInviteToken(): { token: string; tokenHash: string }` (token = 32 random bytes base64url; hash = sha256 hex); `hashInviteToken(token: string): string`; `createInvite(groupId, createdBy, opts?: { ttlMs?, maxUses? }): Promise<{ token }>` (stores hash); `validateInvite(token: string): Promise<{ ok: true; inviteId; groupId } | { ok: false; reason: "invalid"|"expired"|"revoked"|"exhausted" }>` (constant-time hash lookup); `consumeInvite(inviteId): Promise<void>` (increments `uses`).

- [ ] **Step 1: Failing tests** (node) covering the PURE parts: `hashInviteToken` is deterministic + 64-hex; `newInviteToken` produces distinct tokens whose hash matches `hashInviteToken(token)`; a `classifyInvite(row, now)` pure helper returns `expired`/`revoked`/`exhausted`/`ok` correctly. (DB-touching `createInvite`/`validateInvite` are thin; test `classifyInvite` + hashing.)
```ts
import { describe, it, expect } from "vitest";
import { hashInviteToken, newInviteToken, classifyInvite } from "./invites";
describe("invites", () => {
  it("hashes deterministically to 64 hex", () => {
    const h = hashInviteToken("abc"); expect(h).toMatch(/^[0-9a-f]{64}$/); expect(hashInviteToken("abc")).toBe(h);
  });
  it("newInviteToken hash matches", () => { const {token,tokenHash}=newInviteToken(); expect(hashInviteToken(token)).toBe(tokenHash); });
  it("classifyInvite flags states", () => {
    const now = Date.parse("2026-07-03T00:00:00Z");
    expect(classifyInvite({ revoked:true, expires_at:"2099-01-01", uses:0, max_uses:null }, now)).toBe("revoked");
    expect(classifyInvite({ revoked:false, expires_at:"2000-01-01", uses:0, max_uses:null }, now)).toBe("expired");
    expect(classifyInvite({ revoked:false, expires_at:"2099-01-01", uses:5, max_uses:5 }, now)).toBe("exhausted");
    expect(classifyInvite({ revoked:false, expires_at:"2099-01-01", uses:0, max_uses:null }, now)).toBe("ok");
  });
});
```
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** `src/lib/invites.ts`: `newInviteToken` uses `randomBytes(32).toString("base64url")`; `hashInviteToken` = `createHash("sha256").update(token).digest("hex")`; `classifyInvite(row, nowMs)` pure; `createInvite` inserts `{id:newId("inv"), token_hash, group_id, created_by, expires_at: now+ttl (default 7d), max_uses}` and returns the RAW token (only shown once); `validateInvite` looks up by `token_hash` (single indexed row → no timing oracle), runs `classifyInvite`; `consumeInvite` `UPDATE invites SET uses = uses + 1 WHERE id=…`. Default TTL 7 days.
- [ ] **Step 4: Run — PASS.** **Step 5: Commit** — `feat(auth): invite token generation + validation (hashed, expiring, revocable)`

---

### Task 4: Custom Auth.js adapter over Neon

**Files:** Create `src/auth/adapter.ts`, `src/auth/adapter.test.ts`.

**Interfaces — Consumes:** `sql` (`src/db/client.ts`), `newId` (`src/lib/ids.ts`). **Produces:** `NeonAdapter(): Adapter` implementing the methods Auth.js needs for JWT-session + Google + Credentials + email verification: `createUser, getUser, getUserByEmail, getUserByAccount, updateUser, linkAccount, createVerificationToken, useVerificationToken`. (No session methods — JWT strategy.) Plus pure row↔object mappers `rowToUser`, `rowToAccount` exported for testing.

- [ ] **Step 1: Failing test** — unit-test the pure mappers (`rowToUser` maps snake_case DB row → Auth.js `AdapterUser` incl. `emailVerified` as Date|null; `rowToAccount` similar). These are the parts with mapping bugs; the sql calls are thin.
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** the adapter: each method issues one `sql` query and maps via `rowToUser`/`rowToAccount`. `createUser` → INSERT into `users` returning the row. `getUserByAccount` → JOIN `accounts`. `linkAccount` → INSERT into `accounts`. `createVerificationToken`/`useVerificationToken` → the `verification_token` table (delete-on-use, return the row or null). Follow the Auth.js v5 `Adapter` type signatures exactly (import type from `@auth/core/adapters`).
- [ ] **Step 4: Run — PASS.** **Step 5: Commit** — `feat(auth): custom Auth.js adapter over Neon sql client`

---

### Task 5: Auth.js config + route handler

**Files:** Create `src/auth/config.ts`, `src/app/api/auth/[...nextauth]/route.ts`; Modify `package.json` (add `next-auth@^5` / `@auth/core`).

**Interfaces — Consumes:** `NeonAdapter` (T4), `verifyPassword` (T2). **Produces:** exports `handlers` (GET/POST), `auth()` (server session getter → `{ user: { id } } | null`), `signIn`, `signOut`. Session strategy `jwt`; `jwt` callback puts `userId` on the token; `session` callback exposes `session.user.id = token.userId` and NOTHING else identity-bearing.

- [ ] **Step 1: Install** — `npm install next-auth@^5` (and `@auth/core` if not transitively present). Confirm `npm run build` still succeeds with NO auth env set (Auth.js must not throw at build/import when `AUTH_SECRET`/Google unset — guard provider config on env presence).
- [ ] **Step 2: Implement `src/auth/config.ts`:**
```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { NeonAdapter } from "./adapter";
import { verifyPassword } from "./password";
import { sql } from "@/db/client";

const googleEnabled = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: NeonAdapter(),
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    ...(googleEnabled ? [Google({ allowDangerousEmailAccountLinking: false })] : []),
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (c) => {
        const email = String(c?.email ?? "").toLowerCase();
        const password = String(c?.password ?? "");
        if (!email || !password) return null;
        const rows = (await sql`SELECT id, email, email_verified, password_hash FROM users WHERE email = ${email}`) as any[];
        const u = rows[0];
        if (!u || !u.password_hash) return null;
        if (!u.email_verified) return null;                 // must verify first
        if (!(await verifyPassword(password, u.password_hash))) return null;
        return { id: u.id, email: u.email };
      },
    }),
  ],
  callbacks: {
    // Verified-email account linking: only link Google→existing user if that user's email is verified.
    signIn: async ({ user, account }) => {
      if (account?.provider === "google") {
        const email = (user.email ?? "").toLowerCase();
        if (!email) return false;
        const rows = (await sql`SELECT id, email_verified FROM users WHERE email = ${email}`) as any[];
        const existing = rows[0];
        if (existing && !existing.email_verified) return false; // don't link onto an unverified local account
      }
      return true;
    },
    jwt: async ({ token, user }) => { if (user?.id) token.userId = user.id; return token; },
    session: async ({ session, token }) => {
      session.user = { id: (token as any).userId } as any;   // ONLY id — no role/membership in the token
      return session;
    },
  },
});
```
- [ ] **Step 3: Implement route** `src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/auth/config";
export const { GET, POST } = handlers;
export const runtime = "nodejs";
```
- [ ] **Step 4: Verify secret-free build** — Run: `rm -rf .next && mv .env.local .env.local.bak 2>/dev/null; npm run build; S=$?; mv .env.local.bak .env.local 2>/dev/null; echo exit:$S`. Expected: exit 0 (Google provider omitted when unset; Auth.js does not throw). Then `npm run typecheck && npm run lint && npm test` green.
- [ ] **Step 5: Commit** — `feat(auth): Auth.js config (Google + Credentials, JWT session, verified-email linking) + route`

---

### Task 6: Email sender (Resend) — secret-free

**Files:** Create `src/lib/email.ts`, `src/lib/rateLimit.ts`, `src/lib/email.test.ts`.

**Interfaces — Produces:** `sendVerificationEmail(to, link)`, `sendPasswordResetEmail(to, link)`, `sendAdminJoinNotification(playerName, email)`, each `Promise<{ sent: boolean }>`; all **no-op returning `{sent:false}` when `RESEND_API_KEY` is unset** (so CI/build/tests need no secret). Pure `renderVerificationEmail(link): {subject, html, text}` etc. exported for tests. `rateLimit(key, maxPerWindow, windowMs): boolean` (in-memory; returns false when over limit).

- [ ] **Step 1: Failing test** (node): `renderVerificationEmail("https://x/verify?t=1")` includes the link in subject-less body; `sendVerificationEmail` returns `{sent:false}` when `RESEND_API_KEY` unset (delete env in test); `rateLimit` allows N then blocks the N+1 within the window.
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** — `email.ts` posts to Resend's HTTP API (`https://api.resend.com/emails`) with `EMAIL_FROM`; guard: if `!process.env.RESEND_API_KEY` return `{sent:false}` (log a warning). Pure render fns build subject/html/text. `rateLimit` uses a module-level `Map<key, timestamps[]>`.
- [ ] **Step 4: Run — PASS.** **Step 5: Commit** — `feat(email): Resend sender (verification/reset/admin-notify) + rate limiter, no-op without key`

---

### Task 7: Membership & authorization resolver

**Files:** Create `src/lib/membership.ts`, `src/lib/membership.test.ts`.

**Interfaces — Consumes:** `auth()` (T5), `sql`. **Produces (DB is source of truth):**
`resolveViewer(): Promise<{ userId: string; player: { id, displayName } | null; isAdmin: boolean } | null>` — from the session `userId`, looks up the user's `player` in `g1` (`user_id = userId AND group_id='g1'`) and its `is_admin`; returns null if no session. `requireMember()` → the viewer or throws/returns a 401/403 signal; `requireAdmin()` → viewer with `isAdmin` or 403. Pure helper `authzResult(viewer, need): "ok"|"unauthenticated"|"not-member"|"not-admin"` for testing.

- [ ] **Step 1: Failing test** (node) for the pure `authzResult`: null→unauthenticated; viewer with `player:null`→not-member; member without admin + need admin→not-admin; member+admin→ok; member + need member→ok.
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** — `resolveViewer` queries `players` joined on the session user; `requireMember`/`requireAdmin` wrap it and map `authzResult` to HTTP responses (return a discriminated result the routes turn into `NextResponse`). NEVER read role from the token.
- [ ] **Step 4: Run — PASS.** **Step 5: Commit** — `feat(auth): DB-sourced membership/admin resolver + guards`

---

### Task 8: Claims lifecycle

**Files:** Create `src/lib/claims.ts`, `src/lib/claims.test.ts`.

**Interfaces — Produces:** `unclaimedLegacyPlayers(groupId): Promise<{id,displayName}[]>` (players with `user_id IS NULL AND archived = false`); `createPendingClaim(userId, playerId): Promise<{ ok: true } | { ok:false; reason }>` (rejects if the player is already claimed/archived, if a pending claim exists, or if the user already has a player in the group — one-player-per-user); `listPendingClaims(groupId)`; `approveClaim(claimId, adminUserId): Promise<{ playerName, userEmail }>` (sets `players.user_id`, locks, marks claim approved, records `approved_by`/`decided_at`); `rejectClaim(claimId, adminUserId)`; `archivePlayer(playerId, adminUserId)`; `createFreshPlayer(userId, groupId, displayName)`; `migrationActive(groupId): Promise<boolean>` (true iff unclaimed legacy players remain — drives whether the claim UI shows). Pure `canClaim(player, existingUserPlayer, pendingExists)` for testing.

- [ ] **Step 1: Failing tests** (node) for the pure `canClaim`: archived player→no; already-linked player→no; user already has a player→no; pending claim exists→no; otherwise→yes. **Step 2: FAIL. Step 3: Implement** (guards enforce the one-player-per-user + locking invariants at the query level too, relying on the unique indexes from Task 1). **Step 4: PASS. Step 5: Commit** — `feat(auth): claim lifecycle (pending/approve/reject/archive) + fresh-player creation`

---

### Task 9: Invite + onboarding API

**Files:** Create `src/app/api/invites/route.ts` (POST create — admin), `src/app/api/invites/redeem/route.ts` (POST redeem), `src/app/api/onboarding/route.ts` (GET state, POST claim/create); `src/app/api/onboarding/onboarding.test.ts` where feasible.

**Interfaces — Consumes:** invites (T3), claims (T8), membership (T7), email (T6), auth (T5). **Produces (all `runtime="nodejs"`):**
- `POST /api/invites` — `requireAdmin`; body `{ttlMs?, maxUses?}` → `createInvite` → returns the raw token/link ONCE.
- `POST /api/invites/redeem` — authed session required; body `{token}` → `validateInvite`; on ok, marks the session eligible to onboard (e.g. sets a short-lived signed "invited" cookie scoped to the group, or records eligibility) and `consumeInvite`. Invalid → 400 with the neutral reason.
- `GET /api/onboarding` — authed; returns `{ needsInvite: boolean, migrationActive: boolean, unclaimed: [...], alreadyMember: boolean }` (viewer’s state, all DB-resolved).
- `POST /api/onboarding` — authed + invite-eligible; body `{action:"claim", playerId}` → `createPendingClaim`; `{action:"create", displayName}` → `createFreshPlayer` + `sendAdminJoinNotification`. Claim does NOT notify until approved.

- [ ] Steps: write route logic reusing the libs; test the request→lib wiring where practical (mock the libs) or defer behavioral coverage to the libs’ own tests + preview. Enforce authz on every route (`requireAdmin`/authed+eligible). Commit — `feat(api): invite + onboarding endpoints (invite-gated, admin-created invites)`

---

### Task 10: Admin claims-queue API

**Files:** Create `src/app/api/admin/claims/route.ts` (GET list pending), `src/app/api/admin/claims/[id]/route.ts` (POST approve/reject), `src/app/api/admin/players/[id]/archive/route.ts`.

**Interfaces:** all `requireAdmin`. Approve → `approveClaim` + `sendAdminJoinNotification` (the join now completes). Reject → `rejectClaim`. Archive → `archivePlayer`. Commit — `feat(api): admin claims approval queue + archive`

---

### Task 11: Rewrite `POST /api/entries` to session identity

**Files:** Modify `src/app/api/entries/route.ts`; add/adjust its test.

- Replace the `displayName`+`pin` guard with `requireMember()` → the server-resolved `player`. **Ignore any client-supplied player id/displayName.** Attribute the entry to `viewer.player.id`. Keep the parse/append-only logic and the Sentry parse-failure alert. 401 when unauthenticated, 403 when not a member. Commit — `feat(api): attribute entries to the session's player; drop name/PIN`

---

### Task 12: Rewrite `POST /api/admin/*` to role gate

**Files:** Modify `src/app/api/admin/games/route.ts`, `src/app/api/admin/players/rename/route.ts`.

- Replace the `adminPassphrase` body check with `requireAdmin()`. Drop the passphrase from the request contract. Commit — `feat(api): gate admin routes by is_admin role, not passphrase`

---

### Task 13: Verification & password-reset flows

**Files:** Create `src/app/api/auth/register/route.ts` (email/password signup → create user (unverified) + send verification), `src/app/api/auth/verify/route.ts` (consume token → set `email_verified`), `src/app/api/auth/reset/route.ts` (request → enumeration-safe; and confirm → set new `password_hash`). Uses `verification_token` (single-use), `rateLimit`, `hashPassword`, `email.ts`.

- Enforce: single-use tokens (delete on use), short TTL (e.g. 30 min), rate-limited sends, enumeration-safe responses (identical success message whether or not the email exists). Commit — `feat(auth): email verification + enumeration-safe password reset`

---

### Task 14: Sign-in screen (replace SignInGate)

**Files:** Replace `src/components/SignInGate.tsx`; update `src/components/shell.test.tsx`/`signInGate.test.tsx`.

- Bragboard-styled (tokens + `Button`): a **"Continue with Google"** button (calls `signIn("google")`; shown only if Google is configured — feature-flag via a public env or a `/api/auth/providers` check), an **email + password** form (`signIn("credentials", …)`), a **"Create account"** path (→ `register`) with a "check your email to verify" state, and a **"Forgot password"** link (→ reset). On success, route into the app; the app shell then drives onboarding via `GET /api/onboarding`. Behavior tests (jsdom, mock the calls). Commit — `feat(ui): Auth.js sign-in screen (Google + email/password + verify/reset states)`

---

### Task 15: Invite + onboarding UI

**Files:** Create `src/app/(app)/onboarding/` screens (or components rendered by `AppShell` when `GET /api/onboarding` says so): **need-invite** screen ("ask the group owner for an invite"), **invite redeem** (reads token from the invite link `?invite=…` → `POST /api/invites/redeem`), **claim** step (lists `unclaimed`, choose → pending, shows "waiting for owner approval"), **create player** step.

- `AppShell` (from workstream B) gains an onboarding gate: after auth, call `GET /api/onboarding`; route to need-invite / claim-or-create / into the app accordingly. Bragboard-styled; behavior tests. Commit — `feat(ui): invite redeem, need-invite, and claim/create onboarding`

---

### Task 16: Admin UI — claims queue + invites; functional Sign out

**Files:** Extend `src/app/(app)/admin/page.tsx`; Modify `src/components/Drawer.tsx`.

- Admin screen gains: **Pending claims** list (from `GET /api/admin/claims`) with Approve/Reject; **Generate invite** (calls `POST /api/invites`, shows the link once to copy); and the existing add-game/rename now work via the role (no passphrase field). The claims section **only renders while `migrationActive`**. Drawer: **restore a functional Sign out** calling `signOut()`. Behavior tests. Commit — `feat(ui): admin claims queue + invite generation; functional Sign out`

---

### Task 17: Log screen — drop name/PIN

**Files:** Modify `src/app/(app)/log/page.tsx`; update `src/components/log.test.tsx`.

- Remove the display-name + PIN inputs; the logged-in identity is implicit. `postEntry` sends only the score payload (no `displayName`/`pin`). Update `src/lib/api.ts` `postEntry` signature accordingly and any other caller. Behavior tests. Commit — `feat(ui): Log screen uses the session identity (no name/PIN)`

---

### Task 18: Cutover, human setup, and final verification

**Files:** Modify `src/db/schema.sql` (cutover drops — separate, applied only after verification); delete/retire the old passphrase path (`src/app/api/auth/route.ts` old passphrase handler, `set-passphrase`/`set-admin-passphrase` scripts, legacy `hash.ts` PIN usage) once nothing references them.

- [ ] **Step 1 (owner, guided):** create a **Google OAuth app** (Client ID/Secret; authorized redirect URIs for prod `https://scoring-tracker.vercel.app/api/auth/callback/google` + the preview domain); create a free **Resend** account + verified sender; set `GOOGLE_CLIENT_ID/SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFY_EMAIL`, `AUTH_URL` in Vercel (Production + Preview). `AUTH_SECRET` already set.
- [ ] **Step 2 (controller/owner):** apply the additive migration (Task 1) to **production** Neon. Seed the owner as admin once claimed, or directly: `UPDATE players SET is_admin = true WHERE id = '<owner player id>'` (guided, scoped).
- [ ] **Step 3:** Generate the first invite; the four friends claim; owner approves each; verify history carried over (on **preview** first).
- [ ] **Step 4 (cutover, after preview verification + prod backup):** take the **backup branch + tag** (standing practice) before the production deploy. Disable the old passphrase/PIN write path (remove the old `/api/auth` passphrase route + the `displayName/pin` acceptance). In a **follow-up** `schema.sql` edit, drop `groups.passphrase_hash`, `groups.admin_passphrase_hash`, `players.pin_hash` and apply to prod — only once every active friend has claimed (don't lock anyone out mid-transition).
- [ ] **Step 5:** Final gate — `npm run typecheck && npm run lint && npm test && npm run build` green; CI green on the PR; on preview: sign in (Google + email/password), redeem invite, claim + approve, log a score, sign out. Commit — `chore(auth): cutover — disable legacy passphrase/PIN; drop legacy columns`

---

## Notes for the executor
- **DB migrations and env setup are guided controller/owner steps** — subagents edit `schema.sql` and code, never run DB commands or hold secrets.
- **Every mutating route must call `requireMember`/`requireAdmin`** — a reviewer should reject any route that trusts a client-supplied identity or reads role from the token.
- UI tasks reuse the **Bragboard design system** (tokens + components from workstream B); visual fidelity is checked on preview, behavior in tests.
- Ship the whole branch through one preview → **security-focused** review → PR → (backup +) merge.
</content>
