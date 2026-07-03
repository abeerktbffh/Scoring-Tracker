# Identity Rebuild — Design Spec

**Date:** 2026-07-03
**Status:** Approved for planning
**Workstream:** Identity rebuild — the sub-project split out of workstream B ([roadmap](2026-07-02-roadmap-design.md)); precedes multi-group (C).

## Goal

Replace the shared **group-passphrase + per-user name/PIN** model with **real per-person
identity**: sign in with Google or email+password, gated by an invite, with the existing
friends migrated onto accounts without losing history — and a real sign-out. Build on the
audited **Auth.js** toolkit rather than hand-rolling security-critical code. Lay the
identity + invite foundation that multi-group (C) will build on, without building group
management UI yet.

## Why now / context

Today (`src/auth/*`, `src/db/schema.sql`): the `group_token` JWT carries only `groupId`
(group-level login via a shared passphrase). "Who you are" is a `display_name` the client
sends; a **PIN guards writes**. `players` are name+PIN rows, `UNIQUE(group_id, display_name)`,
with entries attached by `player_id`. There is no per-person account and no email anywhere.
The Bragboard redesign (workstream B) deliberately deferred this and removed the (inert)
Sign out control pending this workstream.

## Decisions (resolved in brainstorming, 2026-07-03)

- **Toolkit:** **Auth.js (NextAuth)** for Next.js App Router — it handles the OAuth handshake,
  session cookies, CSRF, and provides a DB adapter. We add the email/password path + reset on top.
- **Sign-in methods (both, side by side):** **"Continue with Google"** (OAuth) **and
  email + password**. Email/password sign-ups require **email verification** before joining
  (Google is pre-verified). Password reset via emailed link.
- **Join gate:** a private **invite link/code**. Signing in without a valid invite lands on an
  "ask the owner for an invite" screen — no group access, no posting.
- **Migration of existing friends:** **claim-on-first-login** — a signed-in, invited user with
  no linked player sees "which of these is you?" listing **unclaimed legacy players**; claiming
  links their account to that player and inherits its history. Claimed names **lock** (removed
  from everyone's list). The claim step **only renders while unclaimed legacy players exist**;
  once all are claimed it disappears permanently. Admin can reassign a claim or **archive** a
  straggler legacy player to retire the step. New (non-legacy) joiners **create a fresh player**.
- **Admin:** a **per-person admin role** (a flag on the member record) replaces the shared
  admin passphrase. The owner is the initial admin.
- **Logging a score:** attributed to the **logged-in user's player** — **no more display_name +
  PIN** on entry submission. The PIN concept is removed.
- **Sign-out:** real sign-out via Auth.js (clears the session); the drawer Sign out item returns, functional.
- **Scope:** the single existing group `g1` only. Build the identity + invite primitives;
  **defer multi-group creation/switching UI to workstream C.**

## Data model

Auth.js's DB adapter creates and manages its standard tables in Neon (names per the adapter):
`users` (the person: id, email, emailVerified, name, image), `accounts` (a login method linked
to a user — e.g. the Google account, or the credentials record), `sessions` (active logins;
or JWT-strategy sessions with no table — see below), and `verification_token` (email
verification + magic reset links). We do **not** hand-build these.

We add/extend:
- **`players`** (existing) gains **`user_id TEXT REFERENCES users(id)`** (nullable — a legacy
  player is unclaimed until linked; a fresh player is created already linked). `pin_hash` becomes
  nullable/deprecated (no longer used for auth) and is dropped once migration completes.
  Keep `UNIQUE (group_id, display_name)`. A player represents **group membership** (a user's
  participation in a group) — the row that C will generalize to memberships across groups.
- **`players.is_admin BOOLEAN NOT NULL DEFAULT false`** — the per-person admin role (replaces
  `groups.admin_passphrase_hash`, which is dropped).
- **`invites`** (new): `id`/token, `group_id`, `created_by` (user_id), `expires_at`,
  `max_uses`/`uses` (or single-use), `revoked`. Redeeming a valid invite authorizes the
  signed-in user to join the group (reach claim/create).
- **`groups.passphrase_hash`** is dropped (group-passphrase login retired).

**Session strategy:** Auth.js **JWT session** (no session table) for serverless friendliness on
Vercel; the session carries the `userId`, and the app resolves the user's group membership
(their `player` in `g1`) server-side per request. (Adapter still used for users/accounts/
verification.) The exact adapter (`@auth/*` Postgres/Neon adapter vs. a thin custom adapter over
the existing `sql` client) is a plan-level choice; it must work with the Neon serverless driver.

## Flows

1. **Invited sign-in:** open invite link → Auth.js sign-in (Google or email/password) →
   invite validated → **onboarding**.
2. **Onboarding:** if unclaimed legacy players exist → **claim** step (pick your name → link +
   inherit history, or "I'm new" → create). If none → **create player** directly.
3. **Email/password signup:** create credentials → **verification email** → click link → verified →
   (with invite) onboarding. Unverified users cannot join/post.
4. **Password reset:** "forgot password" → emailed reset link → set new password.
5. **No/invalid invite:** friendly "ask the group owner for an invite" screen; no group access.
6. **Sign-out:** clears the Auth.js session; returns to the sign-in screen.
7. **Logging a score:** the entries endpoint attributes the entry to the session user's player;
   no `displayName`/`pin` in the request.

## What changes / is removed

- **Removed:** group-passphrase login (`/api/auth` passphrase flow), per-entry PIN, shared admin
  passphrase, the `SignInGate` passphrase form (replaced by the Auth.js sign-in screen).
- **Changed:** `POST /api/entries` (identity from session, not name+PIN); `POST /api/admin/*`
  (gated by the admin role on the session user, not a passphrase); the Bragboard **Log** screen
  (drop name/PIN inputs); the **drawer** (functional Sign out returns; Admin gated by role);
  `getMe`/leaderboard "viewer" derives from the session rather than a `player` query param where
  practical (the no-peek `player` param can be resolved from the session).
- **Added:** Auth.js route(s) (`/api/auth/[...nextauth]` or App Router handler), the sign-in
  screen, the invite redeem + "need an invite" screens, the claim/create onboarding, email
  templates (verification + reset), admin invite generation + claim reassignment/archive.

## Migration & rollout

- Additive schema migration first (add `players.user_id`, `players.is_admin`, `invites`;
  keep old columns until cutover). The four existing players remain, unclaimed, until their
  owners sign in and claim. Generate an initial invite for the owner to share.
- Old auth remains only until the new flow is verified on preview; the passphrase/PIN columns
  are dropped in a follow-up migration once every active friend has claimed (avoid locking anyone
  out mid-transition). **Backup branch + tag before the production deploy** (standing practice).
- **Owner is seeded as admin** (`is_admin = true` on the owner's player once claimed, or set
  directly).

## Security

- Auth.js owns OAuth state/PKCE, session signing, CSRF. Secrets (`AUTH_SECRET` already present;
  Google client id/secret; email provider key) are server-side env only; **build stays
  secret-free** (Auth.js no-ops/guards when unset so CI/build need no secrets).
- Invite tokens are unguessable, expiring, and revocable. Email verification prevents typo/fake
  accounts. Passwords hashed with the existing scrypt (`src/auth/hash.ts`) or Auth.js's
  recommended hashing — chosen at plan time; never stored plaintext.
- Independent **security-focused review** at spec, plan, and PR gates (the standing Reviewer role).

## User config (guided, like Sentry)

- A free **Google OAuth app** (Client ID + Secret; authorized redirect URIs for prod + preview) →
  Vercel env (Production + Preview).
- A free **email provider** (e.g. Resend) API key + a verified sender → Vercel env.
- `AUTH_SECRET` (already set) reused/rotated as Auth.js's secret.

## Out of scope (→ workstream C, multi-group)

- Creating/switching **multiple** groups; per-group member management UI; group discovery.
  We build accounts + invites (the primitives C needs) but not group-management screens.
- Passkeys/WebAuthn, additional OAuth providers, org/SSO — not now.

## Success criteria

- A friend opens an invite link, signs in with Google **or** email+password (verified), and —
  if they're one of the original four — **claims their name and keeps all their history**;
  a brand-new friend creates a fresh player.
- **No passphrase, no PIN** anywhere; logging a score never asks "who are you?".
- **Sign out works** (session cleared).
- Admin actions (add game, rename, invites, reassign/archive claims) are gated by the **admin
  role**, not a shared password.
- Once all legacy names are claimed, the claim UI is gone.
- CI stays green; build stays secret-free; prod deploy has a backup/rollback point.
