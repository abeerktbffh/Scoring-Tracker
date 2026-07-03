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
- **Migration of existing friends:** **claim-on-first-login, admin-approved** — a signed-in,
  invited user with no linked player sees "which of these is you?" listing **unclaimed legacy
  players** and picks one. The claim is created **pending** and confers **no access to that
  player's history until the admin approves it** (this is the authorization gate that prevents
  claiming the wrong / someone else's identity — an invite is only a *join* gate, never proof of
  identity). On approval, the account links to the player and inherits its history; the name
  **locks** (removed from everyone's list). Claims are **audited** (`claimed_by_user_id`,
  `claim_status` ∈ pending/approved/rejected, `claimed_at`, `approved_by`) and **reversible** by
  admin. The claim step **only renders while unclaimed, unarchived legacy players exist**; once
  all are claimed/archived it disappears permanently. Admin can reject/reassign a claim or
  **archive** a straggler legacy player. New (non-legacy) joiners **create a fresh player**
  (no approval needed — a fresh player has no pre-existing history to protect).
- **Admin:** a **per-person admin role** (a flag on the member record) replaces the shared
  admin passphrase. The owner is the initial admin.
- **Admin join-notification (permanent):** the admin is **emailed every time a player joins the
  group** — both when a claim is approved during migration AND, ongoing forever, whenever a new
  friend creates a fresh player. This is informational (not an approval gate) and persists after
  migration. Uses the same email provider.
- **Claim approval is migration-only (transitional):** the approve/reject workflow exists **only
  while unclaimed legacy players remain** (the migration window). It self-retires with the claim
  step; after migration there is **no approval** — invited friends create a fresh player directly
  and the admin is simply notified (per the bullet above).
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
- **`players`** (existing) gains: **`user_id TEXT REFERENCES users(id)`** (nullable — a legacy
  player is unclaimed until an *approved* claim links it; a fresh player is created already
  linked); **`is_admin BOOLEAN NOT NULL DEFAULT false`** (per-person admin role, replaces the
  shared admin passphrase); **`archived BOOLEAN NOT NULL DEFAULT false`** (straggler retirement /
  drives the "unclaimed legacy" set). `pin_hash` → `DROP NOT NULL` in the additive migration,
  dropped entirely at cutover. Keep `UNIQUE (group_id, display_name)`; **add `UNIQUE (group_id,
  user_id) WHERE user_id IS NOT NULL`** (one player per person per group). A player represents
  **group membership** — the row C generalizes to memberships across groups.
- **`claims`** (new, or claim fields on a pending-link row): `player_id`, `claimed_by_user_id`,
  `claim_status` ∈ (`pending`/`approved`/`rejected`), `claimed_at`, `approved_by`. Drives the
  admin approval queue; a claim confers **no** history access until `approved`. Audited & reversible.
- **`invites`** (new): `id`, `token_hash` (store the **hash**, not the raw token; look up by hash,
  constant-time compare), `group_id`, `created_by` (user_id), `expires_at`, `revoked`,
  optional `uses`/`max_uses`. A valid invite authorizes a signed-in user to reach claim/create
  (join). Invite validity never affects an already-joined account.
- **`groups.passphrase_hash`** and **`groups.admin_passphrase_hash`** are dropped (group-passphrase
  and shared-admin-passphrase logins retired) — at cutover, after the new flow is verified.

**Session strategy:** Auth.js **JWT session** (no session table) for serverless friendliness on
Vercel; the session carries the `userId`, and the app resolves the user's group membership
(their `player` in `g1`) server-side per request. (Adapter still used for users/accounts/
verification.) The exact adapter (`@auth/*` Postgres/Neon adapter vs. a thin custom adapter over
the existing `sql` client) is a plan-level choice; it must work with the Neon serverless driver.

## Flows

1. **Invited sign-in:** open invite link → Auth.js sign-in (Google or email/password) →
   invite validated → **onboarding**.
2. **Onboarding:** if unclaimed legacy players exist → **claim** step (pick your name → a
   **pending** claim is created; you're told it awaits owner approval and you get no history until
   then — or choose "I'm new" → create a fresh player, no approval needed). If none → **create
   player** directly. The **admin** sees a **claim approval queue** and approves/rejects each; on
   approval the account links to the player and inherits its history.
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
  templates (verification + reset + **admin "new player joined" notification**), admin invite
  generation + the (migration-only) claim approval queue + claim reassignment/archive, and the
  server-side hook that emails the admin whenever a player joins.

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
- Email verification prevents typo/fake accounts; passwords never stored plaintext.
- **The binding security requirements are the "Security decisions" section below** (claim
  authorization, account linking, invite/token hardening, DB-source-of-truth, server-side authz,
  hashing params, migration ordering). The plan MUST implement that section; this paragraph is
  only an overview.
- Independent **security-focused review** at spec, plan, and PR gates (the standing Reviewer role).

## Security decisions — resolving the spec-review conditions (2026-07-03)

The independent security review returned APPROVED-WITH-CONDITIONS. Each finding and its
binding resolution (the plan MUST implement these):

- **[Critical] Claim authorization.** Resolved above: claims are **admin-approved & pending**;
  no history transfers until approval; audited + reversible. An invite never itself proves identity.
- **[Important] One login method per email (no cross-method linking) — decision revised 2026-07-03.**
  Each email address is bound to **exactly one** login method — whichever was used first. We do
  **not** auto-link Google and email/password into one account (that linking is the classic hijack
  surface and is disproportionate for a 4-5 person group). Enforcement:
  - `allowDangerousEmailAccountLinking: false` (Auth.js never blind-links).
  - A **Google** sign-in whose email already belongs to a **credentials** user (has `password_hash`)
    is **rejected** with a clear message ("this email already signs in with a password — use that").
  - A **credentials registration** for an email that already exists (Google or credentials) is
    **rejected** with a clear message ("this email is already registered — sign in instead").
  - New **Google** users are created **email-verified** (Google emails are provider-verified) so
    `createUser` sets `email_verified` from the profile.
  - Still enforce **one player per (user, group)**: `UNIQUE (group_id, user_id) WHERE user_id IS NOT NULL`.
  Trade-off (accepted): a person cannot use both methods interchangeably for one email; they use
  whichever they signed up with. Removes the entire linking attack surface.
- **[Important] Invite lifecycle.** Invite tokens are **cryptographically random**, stored
  **hashed** (looked up by hash, compared in constant time — never stored raw), with an
  **expiry (TTL)** and **revocable**. A shared multi-use invite is acceptable *because the
  admin-approved claim is the real gate*. Redeeming an expired/revoked/exhausted invite shows a
  neutral "ask the owner" screen and **never affects an already-joined account** (a joined user
  stays joined regardless of invite state).
- **[Important] DB is source of truth (JWT freshness).** The session token carries **only
  `userId`**. **Membership and `is_admin` are read from the DB on every privileged request** —
  never trusted from the token — so revoking admin/removing a member takes effect immediately.
  Set a sane session TTL.
- **[Important] Server-side authorization on every mutating endpoint.** `POST /api/entries` and
  `POST /api/admin/*` each independently verify: (a) authenticated session, (b) the user's
  resolved membership in `g1`, (c) `is_admin` for admin routes. **Entries are attributed to the
  server-resolved player; any client-supplied player id is ignored.** UI gating is cosmetic only.
- **[Important] Password hashing.** Reuse `src/auth/hash.ts` scrypt but set **explicit cost
  parameters** (not Node defaults): `N=2^15 (32768)`, `r=8`, `p=1`, `keylen=64`, random 16-byte
  salt, `timingSafeEqual` comparison (already present). (Or Auth.js's recommended credential
  hashing — the plan picks one explicitly.) Confirm the exact Auth.js adapter + Credentials-provider
  wiring at plan time.
- **[Important] Verification & reset token hardening.** Verification and password-reset tokens are
  **single-use, short-TTL, invalidated on use**; verification/reset **sends are rate-limited**;
  the "forgot password" response is **enumeration-safe** (identical response whether or not the
  email exists). Keep these inside Auth.js-managed routes where possible; any custom endpoint
  inherits the same **CSRF** protection.
- **[Minor] Migration ordering.** The **additive** migration must include `ALTER TABLE players
  ALTER COLUMN pin_hash DROP NOT NULL` (so PIN-less fresh players can be inserted) and add a
  **`players.archived BOOLEAN NOT NULL DEFAULT false`** flag (drives the "unclaimed legacy player"
  set and straggler archiving). `groups.passphrase_hash`/`admin_passphrase_hash` are **dropped**
  (not merely unused) in the cutover migration, sequenced after the new flow is verified.
- **[Minor] Old auth cutover.** The old passphrase/PIN write path is **disabled in production the
  moment the new session-based flow goes live** — not left running in parallel (no unauthenticated-
  by-session bypass of the new gate).

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
