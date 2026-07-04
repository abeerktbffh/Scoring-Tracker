# Multi-Group Support (Workstream C) — Design Spec

**Status:** Draft for review (revised after independent review 2026-07-04)
**Date:** 2026-07-04
**Depends on:** Identity rebuild (live), open-join (live), frontend overhaul (live)
**Deferred to later workstreams:** analytics dashboard (incl. platform-wide group/player oversight), offline games (D), auto-import (E)

## Goal

Turn Bragboard from a single shared board into a global board of all players plus user-created private groups. A person logs each puzzle **once**; that result flows to the global board and to every group they belong to. Groups are membership "lenses" over one shared set of results — not separate silos.

## Core mental model

- **Puzzles are universal.** Everyone plays the same Wordle #1234 on a given day. So a result belongs to the **person**, logged once, globally.
- **Identity is global.** One display name per person, shown everywhere. Name uniqueness is global and case-insensitive.
- **Games are one master catalog.** The platform owner curates which puzzle games exist. Each group picks the subset it displays. The global board shows the full catalog.
- **Groups are lenses.** A group is a set of people + a chosen subset of games. A group's board = the same globally-logged results, filtered to that group's members and games. Groups are private/unlisted, joined only via an invite link.
- **The global board is everyone who has played, always on, signed-in only.** No joining; every authenticated account is on it once they have a name and at least one result.

## Roles (two distinct kinds of admin)

1. **Platform super-admin** — the owner (only Abeer, today). Manages the master game catalog and platform concerns. The in-app **Admin panel and its drawer entry are hidden entirely for everyone else.** Stored as `users.is_super_admin`.
2. **Group admin** — the creator of a group (and any auto-promoted successor). Manages *their* group only. Stored as `role` on the group membership.

A person can be a group admin of their groups without being a platform super-admin. The two checks are **orthogonal** and split into separate server guards (see Security).

## Decisions locked during brainstorming + review

| Area | Decision |
|---|---|
| Logging | Log once; result shared to global + all the person's groups. |
| Game catalog | One shared master catalog (owner-curated). Each group selects its tracked subset (all-on by default at creation). Global shows all active games. |
| Display name | One global name per person. Uniqueness is **global**, case-insensitive. |
| Group joining | Invite link only. No approval. Groups unlisted/private. |
| Invite link | One shareable link per group, **no expiry / no max-uses**, but a group admin can **Reset link** (regenerate → old link stops working) if it leaks. Token stored hash-only. Any member can share the current link; only an admin can reset it. |
| Group admin powers | Rename group, choose tracked games, remove members, reset invite link, delete group. |
| Admin leaves group | Auto-promote the **oldest member** (earliest `joined_at`) to admin. If the admin is the **last** member, leaving deletes the group. |
| Delete group | Group admin can delete their group. Removes the group + memberships + game selections + invite; **no one's global results are affected.** |
| Board switcher (UI) | Dropdown on the screen title ("Global ▾"): Global (pinned, ✓) + the person's groups + **+ New group** pinned at bottom. |
| Manage affordance (UI) | **Overflow menu (⋮)** top-right of a group board. Admin: **Manage · Invite · Leave**; member: **Invite · Leave**. Global board has no ⋮. |
| Global board visibility | **Signed-in only** (no public/anonymous view). Consistent with the app today. |
| Platform oversight / analytics | **Out of scope for C** — moves to a separate future analytics workstream (this includes the "view all groups" panel). |
| Master catalog management | **Stays in C** (owner-only) — group admins pick from the catalog; only the owner adds/edits/deactivates catalog games. |
| Nameless accounts | An authenticated user with no display name is **excluded from all boards** until they set one (prompted on next login). |
| Renaming | People rename **only their own** global name (`/api/me/rename`). The legacy `/api/admin/players/rename` is **retired**. |
| Rollout | **Two phases** (see Rollout): Phase 1 migrates to the new global model incl. the `g1`→global cutover; Phase 2 adds group features. |

## Data model

### Design principle
Results and identity attach to the **person** (`users`), not to a per-group row. Groups reference people; boards are filtered queries derived from `entries`. This removes the old `games.id`-composite-key problem: games are one global catalog, so their PK stays global.

### `users` (identity + global profile) — modify
- Existing: `id, name, email, email_verified, image, password_hash, created_at`.
- **Add** `display_name TEXT` — the global display name (moved off `players`).
- **Add** `is_super_admin BOOLEAN NOT NULL DEFAULT false` — platform owner only; **set explicitly** for the owner during migration (NOT derived from any old `players.is_admin`).
- Backfill display name with exactly:
  `UPDATE users u SET display_name = p.display_name FROM players p WHERE p.user_id = u.id;`
- After backfill, `display_name` **stays nullable** (a user-less/name-less account is possible and is simply excluded from boards until it sets a name). The uniqueness index below permits multiple NULLs.
- **Global name uniqueness** — created **only after** the backfill and a hard zero-collision gate:
  - Gate (must return zero rows or the migration aborts with a remediation step to rename offenders):
    `SELECT lower(display_name), count(*) FROM users WHERE display_name IS NOT NULL GROUP BY 1 HAVING count(*) > 1;`
  - Then: `CREATE UNIQUE INDEX users_display_name_lower_uq ON users (lower(display_name));`
  - This supersedes the per-group `players_group_lower_name_uq` (dropped in cleanup).

### `memberships` (the reshaped `players`) — modify/repurpose
A membership is one person's presence in one **user-created** group. The global board needs no membership rows.
- Columns: `id, group_id, user_id, role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')), joined_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- `UNIQUE (group_id, user_id)` (exists today as `players_group_user_uq`) — also the idempotency backstop for join-via-link.
- **Drop** `display_name` (now on `users`) and `pin_hash` (dead). Drop `archived` unless a query still needs it (the plan confirms; today it is unused post-identity).
- The physical path (rename `players`→`memberships` vs. keep the table name and evolve columns) is a **plan decision** chosen for least migration risk; this spec fixes the *semantics*.

### `games` (master catalog) — modify
- Games are a global catalog owned by the platform. `games.group_id` is **retired from game semantics** (games no longer belong to a group); `games.id` stays the global PK.
- Owner-only lifecycle: add / edit / **deactivate** (`active=false`) catalog games — the existing Admin "add game" capability, re-gated to `is_super_admin`.

### `group_games` (per-group tracked games) — new
- `group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE, game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, PRIMARY KEY (group_id, game_id)`.
- Populated at group creation (defaults to all active catalog games) and edited via group settings.
- A group board shows games in **`group_games ∩ games WHERE active = true`** — deactivating a catalog game hides it from group boards too, staying consistent with global.

### `entries` (reshaped to user-scoped) — modify
- **Add** `user_id TEXT REFERENCES users(id)`; backfill from the old `player_id`:
  `UPDATE entries e SET user_id = p.user_id FROM players p WHERE e.player_id = p.id;`
- Reads/writes switch to `user_id`. `entries.group_id` **and `entries.player_id`** both become vestigial. Before they fall out of use, **drop their NOT NULL** constraints; drop the columns entirely in cleanup (both are in the drop list).
- **One-active-entry-per-day is enforced by the DB**, not app logic. Replace the plain `entries_active_idx` with a **partial UNIQUE index**:
  `CREATE UNIQUE INDEX entries_active_uq ON entries (user_id, game_id, puzzle_date, variant) WHERE superseded_by IS NULL;`
  - Note: SQL unique indexes treat NULLs as distinct, so a `NULL` variant does not self-collide. The write path keys variant with `IS NOT DISTINCT FROM` (as today); for games without variants this is acceptable because there is at most one row per `(user,game,date)` anyway. The plan must confirm variant handling per game type.
- The submit path (currently SELECT-prior → INSERT-new → UPDATE-old across three statements, **non-atomic**) must **catch unique-violation `23505`** and treat it as "someone already logged this slot," re-reading and superseding deterministically — the same conditional-write + constraint pattern already used in `src/lib/claims.ts`. No interactive transaction is available (stateless Neon HTTP driver).

### `groups` — modify
- Keep `id, name, created_at`. **Add** `created_by TEXT REFERENCES users(id)`.
- **Retire** `passphrase_hash`, `admin_passphrase_hash` (legacy). `timezone` → see "Global timezone."

### `invites` (per-group link, admin-resettable) — repurpose
- One **active** row per group: `group_id`, `token_hash` (sha256, hash-only at rest), `created_by`, `created_at`, plus an `active BOOLEAN NOT NULL DEFAULT true` (or delete-and-reinsert on reset — plan's choice). No `expires_at` gate, no `max_uses`.
- **Reset link** (admin only): mark the current row inactive / delete it and insert a fresh token; the old link no longer resolves.
- **Redeem** (any authenticated user): look up the active group by `token_hash` → insert a `memberships` row (`role='member'`). Idempotent: a duplicate hits `UNIQUE (group_id, user_id)` → catch `23505` → treat as no-op ("already a member"). No `join_eligibility`, no approval.
- **Why the identity-rebuild's TTL/revocable/max-uses condition is relaxed:** that condition protected the *claim-approval migration* (unclaimed legacy history + admin approval). Claiming is complete and retired, and groups are private social lenses with no history to protect — so TTL and max-uses add friction without protecting anything. **Revocability is retained** (as "Reset link") specifically to close the leaked-link gap. Hashing at rest is retained.

### Retired tables/columns (cleanup, ordered — see Migration)
- `join_eligibility` — unused; drop.
- `claims` — migration-only, retired; its `player_id`/`group_id` FKs reference tables being reshaped, so it must be **dropped before** the legacy `players`/`g1` rows are removed.
- `players_group_lower_name_uq` — superseded by the global name index.
- Legacy passphrase/pin columns; vestigial `entries.group_id`, `entries.player_id`, `games.group_id`.

### Global timezone
"Log once" requires one day boundary, so day/window logic uses **one platform timezone**. `g1.timezone` is already `Asia/Kolkata`, so **there is no behavior change today** — this is a code move, not a data change. The value moves to a single constant (in `src/lib/day.ts`), and the `entries`, `me`, `leaderboard`, and `board` routes stop reading `groups.timezone`.

## Boards (how leaderboards are computed)

All boards are derived from **`entries` joined to `users`** (a user with zero entries or no name does not appear) — never a cross-product of all accounts.

- **Global board:** all named users with entries × all **active** catalog games. No membership filter. Signed-in only.
- **Group board:** `WHERE user_id IN (SELECT user_id FROM memberships WHERE group_id = $g)` and `game_id IN (SELECT game_id FROM group_games WHERE group_id = $g)` intersected with `games.active = true`.
- **No-peek** applies **after** the membership/game filter and is based on the viewer's **global** play for the day (play is global, so no-peek stays consistent across all of a user's boards). It remains application-layer, not a DB boundary.
- Streaks and per-game metrics are **properties of the person's play** (global); a group board shows the same values for its filtered set of people/games.
- Removing a member or trimming a game changes a group board immediately (it's a filter) and never touches global results.

## User-facing flows

### Board switcher
Title on Home/Standings is a dropdown (`Global ▾`). Menu: **Global** (pinned top, ✓) → the person's groups → divider → **+ New group** (pinned bottom, tinted as an action). Selecting a board re-renders Home/Standings for that board (the read routes take a `groupId`; see Security).

### Create group
1. Tap **+ New group** → name field + a checklist of active catalog games (all ticked by default; untick to trim).
2. **Create** → inserts the group (`created_by = viewer`), a `memberships` row for the creator (`role='admin'`), `group_games` rows for the ticked games, and one invite token.
3. Success screen shows the invite link (Copy / share sheet) + "Go to group".

### Join via link
Opening the invite link (signed in) shows a confirm screen ("Join *Family*?" with member/game counts) → **Join** inserts a membership and drops the person into the group board. Signed out → sign in first, then land back on the confirm screen. Idempotent (already-member → no-op). No approval.

### Manage group (admin only, via ⋮ → Manage)
One settings screen: rename group, edit tracked games, member list with **Remove**, **Reset link**, and **Delete group** (confirmed). Removing a member deletes their membership row only.

### Invite / Leave (⋮)
- **Invite** (all members): shows / shares the current permanent link.
- **Leave group** (all members): deletes the person's membership. If the leaver was the admin, auto-promote the oldest remaining member; if none remain, delete the group (see Security for the atomic pattern).

### Logging (unchanged shape, global effect)
The Log flow is unchanged from the player's view, but an entry attaches to the **user** and appears on the global board and every group the user is in that tracks that game. The game picker offers the full active catalog (today's-due first). Logging is never restricted by group membership.

### Admin panel (owner only)
Hidden for everyone but the platform super-admin. Contents in C: master **Games** catalog management (add/edit/deactivate) and the existing **Players** view. **No Groups/analytics tab in C.**

## Security & correctness requirements

- **DB is source of truth** for identity, membership, and roles. JWT continues to carry only `userId`.
- **Two orthogonal authz guards** (splitting today's single `requireAdmin`, which is hardcoded to `g1`):
  - `requireSuperAdmin()` → `users.is_super_admin`. Gates catalog management (`/api/admin/games`) and the Admin panel/drawer entry.
  - `requireGroupAdmin(groupId)` → `EXISTS (SELECT 1 FROM memberships WHERE group_id=$g AND user_id=$viewer AND role='admin')`. Gates rename/curate-games/remove-member/reset-link/delete-group.
  - `requireMember(groupId)` → membership existence; gates group-board reads and Invite/Leave.
- **Board-read authz:** the read routes (`leaderboard`, `board`, `me`) accept a `groupId`. A **group** board returns `403` unless the viewer is a member; the **global** board is allowed for any authenticated user (and only authenticated — no anonymous access). Membership is always server-derived; a client cannot read a group it isn't in.
- **Entry write** is deduplicated by the partial UNIQUE index + `23505` catch (above), not by read-then-write.
- **Auto-promote-on-admin-leave and last-member-delete are multi-step, not a single statement.** The safe ordering, each step independently re-runnable:
  1. `DELETE FROM memberships WHERE group_id=$g AND user_id=$viewer;`
  2. Promote (idempotent, no-op if an admin already exists):
     `UPDATE memberships SET role='admin' WHERE group_id=$g AND role='member' AND NOT EXISTS (SELECT 1 FROM memberships WHERE group_id=$g AND role='admin') AND id = (SELECT id FROM memberships WHERE group_id=$g AND role='member' ORDER BY joined_at, id LIMIT 1);`
  3. Delete-if-empty: `DELETE FROM groups WHERE id=$g AND NOT EXISTS (SELECT 1 FROM memberships WHERE group_id=$g);` (cascades `group_games`, `invites`).
- **Invite tokens hash-only at rest** (sha256); reset invalidates the prior token.
- **Global name uniqueness** enforced by the DB unique index (case-insensitive) with a clean `409` on collision (reusing the username-change pattern).
- **CI stays green, build stays secret-free.** Production deploy gets a **backup branch + tag first**, and **no production merge or prod DB change happens without the owner's explicit go-ahead.**

## Testing strategy

- **Pure logic (node env):** board-filtering (members × tracked-and-active games), no-peek over global play, auto-promote-oldest selection, last-member-delete decision, global name clash.
- **API route tests (mocked DB):** the full authz matrix (member / group-admin / super-admin / outsider / global) for every mutating and read endpoint; join-via-link (new, already-member no-op, inactive/reset token); create-group defaults; leave/remove semantics incl. admin-leave promotion and last-member delete; reset-link invalidates the old token; entry writes attach to `user_id`, dedupe on the unique index (`23505`), and surface on the correct boards.
- **Component tests (jsdom):** board-switcher dropdown (Global pinned + groups + New group), overflow menu role split, create-group form, manage screen (incl. Reset link + Delete), join confirm screen.
- **Migration:** a dry-run/backfill verification script (run against a preview branch first) asserting: every entry gets a `user_id`; every user with a `players` row gets a `display_name`; zero name collisions; no orphaned FKs after legacy rows are removed.

## Migration (additive-then-cutover on live prod)

The riskiest work: `entries`, `players`, `games` are core tables. Follow the identity-rebuild playbook — additive first, backfill, switch reads/writes, then drop legacy — with a **prod backup branch + tag before cutover** and **explicit owner go-ahead**. Written as an ordered, reversible checklist (the `g1`-dissolution is the delicate part and is Phase 1):

1. **Additive (no behavior change):** add `users.display_name`, `users.is_super_admin`; add `entries.user_id`, `groups.created_by`; create `group_games`; create the invite/membership shape changes as additive columns where possible.
2. **Backfill + verify:** run the exact backfills above (`users.display_name` from `players`; `entries.user_id` from `player_id`); set `is_super_admin=true` for the owner; run the zero-collision gate. Verify counts (every entry has `user_id`; every claimed user has a name).
3. **Create the constraints:** `users_display_name_lower_uq` (after the gate passes); `entries_active_uq` (after confirming no existing duplicate active rows — de-dupe first if any).
4. **Cutover (ordered):**
   a. Rewrite `resolveViewer` so **global membership = "any authenticated user"** (not "has a `g1` row").
   b. Switch all reads/writes to `user_id`-scoped entries, catalog games, global identity, and membership-filtered group boards.
   c. Retire `g1`-as-a-group: its 14 games become the master catalog; drop `claims` and `join_eligibility`; **delete the 5 `g1` membership rows and the `g1` group row** (safe now that global needs no membership and names/entries are already backfilled off them).
5. **Cleanup:** drop `players_group_lower_name_uq`, legacy passphrase/pin columns, and vestigial `entries.group_id`/`entries.player_id`/`games.group_id` (drop NOT NULL first, then the columns).

At cutover there are **zero user-created groups** — everyone is simply on the global board, exactly as today, but on the new model. Groups appear only when people create them. **No starter group is auto-created** for the original crew (they can make one after).

## Rollout (two phases)

- **Phase 1 — Foundation reshape + `g1` dissolution.** Everything in Migration steps 1–5: identity/results go global, games become a catalog, `g1` dissolves into the global board. The app still shows a **single global board** and behaves as today, but on the new model. Independently shippable and reviewed. This isolates the dangerous data migration from feature work.
- **Phase 2 — Group features.** `memberships` roles, create/join-via-link/manage/leave, board switcher, per-group games, overflow menu, reset-link, auto-promote. Pure feature work on the already-migrated model.

## Out of scope (explicit)

- Analytics dashboard and platform-wide group/player oversight (separate workstream).
- Discoverable/public groups, group directories, join-approval flows, public/anonymous board access.
- Per-group timezones, per-group display names, multiple super-admins.
- Group-specific/offline games (workstream D) — the catalog is universal puzzles for now.
