# Multi-Group Support (Workstream C) — Design Spec

**Status:** Draft for review
**Date:** 2026-07-04
**Depends on:** Identity rebuild (live), open-join (live), frontend overhaul (live)
**Deferred to later workstreams:** analytics dashboard (incl. platform-wide group/player oversight), offline games (D), auto-import (E)

## Goal

Turn Bragboard from a single shared board into a global board of all players plus user-created private groups. A person logs each puzzle **once**; that result flows to the global board and to every group they belong to. Groups are membership "lenses" over one shared set of results — not separate silos.

## Core mental model

- **Puzzles are universal.** Everyone plays the same Wordle #1234 on a given day. So a result belongs to the **person**, logged once, globally.
- **Identity is global.** One display name per person, shown everywhere (global board and every group). Name uniqueness is global and case-insensitive.
- **Games are one master catalog.** The platform owner curates which puzzle games exist. Each group picks the subset it displays. The global board shows the full catalog.
- **Groups are lenses.** A group is a set of people + a chosen subset of games. A group's board = the same globally-logged results, filtered to that group's members and games. Groups are private/unlisted, joined only via an invite link.
- **The global board is everyone, always on.** No joining; every account is on it.

## Roles (two distinct kinds of admin)

1. **Platform super-admin** — the owner (only Abeer, today). Manages the master game catalog and platform-level concerns. The in-app **Admin panel and its drawer entry are hidden entirely for everyone else.** Stored as a flag on the user.
2. **Group admin** — the creator of a group (and any auto-promoted successor). Manages *their* group only: rename, choose tracked games, remove members. Stored as a **role** on the group membership.

A person can be a group admin of their groups without being a platform super-admin.

## Decisions locked during brainstorming

| Area | Decision |
|---|---|
| Logging | Log once; result shared to global + all the person's groups. |
| Game catalog | One shared master catalog (owner-curated). Each group selects its tracked subset (all-on by default at creation). Global shows all. |
| Display name | One global name per person. Uniqueness is **global**, case-insensitive. |
| Group joining | Invite link only. No approval. Groups unlisted/private. |
| Invite link | **One permanent link per group** — always valid, no expiry, no revoke. Any member can share it. |
| Group admin powers | Rename group, choose tracked games, remove members, delete group. |
| Admin leaves group | Auto-promote the **oldest member** (earliest `joined_at`) to admin. If the admin is the **last** member, leaving deletes the group. |
| Delete group | Group admin can delete their group. Removes the group + memberships + its game selections; **no one's global results are affected.** |
| Board switcher (UI) | Dropdown on the screen title ("Global ▾"). Lists Global (pinned, ✓) + the person's groups, with **+ New group** pinned at the bottom. |
| Manage affordance (UI) | **Overflow menu (⋮)** top-right of a group board. Admin sees **Manage · Invite · Leave**; member sees **Invite · Leave**. Global board has no ⋮. |
| Platform oversight / analytics | **Out of scope for C.** The super-admin "view all groups" panel and any analytics move to a separate future analytics workstream. |
| Master catalog management | **Stays in C** (owner-only) — group admins pick from the catalog; only the owner adds/edits catalog games. |

## Data model

### Design principle
Results and identity attach to the **person** (`users`), not to a per-group row. Groups reference people; boards are filtered queries. This removes the old `games.id`-composite-key problem entirely: games are a single global catalog, so their PK stays global.

### `users` (identity + global profile) — modify
- Existing: `id, name, email, email_verified, image, password_hash, created_at`.
- **Add** `display_name TEXT` — the global display name (moved off `players`).
- **Add** `is_super_admin BOOLEAN NOT NULL DEFAULT false` — platform owner only.
- **Add** `CREATE UNIQUE INDEX users_display_name_lower_uq ON users (lower(display_name))` — global case-insensitive name uniqueness (supersedes the per-group `players_group_lower_name_uq`).

### `memberships` (the reshaped `players`) — modify/repurpose
A membership is one person's presence in one group.
- Columns: `id, group_id, user_id, role TEXT CHECK (role IN ('admin','member')) NOT NULL DEFAULT 'member', joined_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- `UNIQUE (group_id, user_id)` (already exists as `players_group_user_uq`).
- **Drop** `display_name` (now on `users`) and `pin_hash` (already nullable; dead). `archived` retained if still referenced, otherwise dropped.
- The current `players` table is renamed/repurposed to `memberships` (kept as `players` physically if that's lower-risk; the plan will decide the least-disruptive path). Membership rows exist only for **user-created groups** — the global board needs none.

### `games` (master catalog) — modify
- Games become a global catalog owned by the platform. The `group_id` column is retired from game semantics (games no longer belong to a group). `games.id` remains the global PK.
- Owner-only: add/edit/deactivate catalog games (existing Admin "add game" capability, gated to `is_super_admin`).

### `group_games` (per-group tracked games) — new
- Columns: `group_id TEXT REFERENCES groups(id) ON DELETE CASCADE, game_id TEXT REFERENCES games(id), PRIMARY KEY (group_id, game_id)`.
- A group's board shows only the games in this table. Populated at creation (defaults to all active catalog games) and edited via group settings.

### `entries` (reshaped to user-scoped) — modify
- **Add** `user_id TEXT REFERENCES users(id)`; backfill from `players.user_id` via the old `player_id`. Reads/writes switch to `user_id`.
- **Retire** `group_id` from entry semantics (results are global). Column may remain temporarily for safety, dropped at cutover.
- No-peek / one-entry-per-day uniqueness becomes per `(user_id, game_id, puzzle_date)` among active (`superseded_by IS NULL`) rows.
- `entries_active_idx` re-created on `(user_id, game_id, puzzle_date) WHERE superseded_by IS NULL`.

### `groups` — modify
- Keep `id, name, created_at`. **Add** `created_by TEXT REFERENCES users(id)`.
- **Retire** `passphrase_hash`, `admin_passphrase_hash` (legacy; already unused). `timezone` → see "Global timezone" below.

### `invites` (permanent per-group link) — repurpose
- One active row per group: `group_id`, `token_hash` (sha256 of the link token, hash-only at rest), `created_at`. No expiry, no revoke, no `max_uses` (per the permanent-link decision).
- Redeeming: look up group by `token_hash` → if the authed user isn't already a member, insert a `memberships` row (`role='member'`). No `join_eligibility`, no approval.

### Retired tables/columns
- `join_eligibility` — unused (was the invite→approval gate). Drop.
- `claims` — migration-only, already retired; leave as historical or drop in cleanup.
- Legacy passphrase/pin columns — drop at cutover.

### Global timezone
Day boundaries must be consistent for a "log once" model, so the day/window logic uses **one platform timezone** (`Asia/Kolkata`, today's value), not a per-group timezone. `groups.timezone` is retired.

## Boards (how leaderboards are computed)

- **Global board:** all users × all active catalog games. No membership filter.
- **Group board:** `WHERE user_id IN (SELECT user_id FROM memberships WHERE group_id = $g)` and `game_id IN (SELECT game_id FROM group_games WHERE group_id = $g)`.
- Streaks and per-game metrics are **properties of the person's play** (global). A group board shows the same streak values, just for the filtered set of people/games.
- Removing a member or trimming a game changes a group board immediately (it's a filter) and never touches global results.

## User-facing flows

### Board switcher
Title on Home/Standings is a dropdown (`Global ▾`). Menu: **Global** (pinned top, ✓) → the person's groups → divider → **+ New group** (pinned bottom, tinted as an action). Selecting a board re-renders Home/Standings for that board.

### Create group
1. Tap **+ New group** → name field + a checklist of catalog games (all ticked by default; untick to trim).
2. **Create** → creates the group, a `memberships` row for the creator (`role='admin'`), `group_games` rows for the ticked games, and one permanent invite link.
3. Success screen shows the permanent invite link (Copy / share sheet) + "Go to group".

### Join via link
Opening the invite link (signed in) shows a confirm screen ("Join *Family*?" with member/game counts) → **Join** inserts a `memberships` row and drops the person into the group board. Signed out → sign in first, then land back on the confirm screen. No approval.

### Manage group (admin only, via ⋮ → Manage)
One settings screen: rename group, edit tracked games, member list with **Remove**, and **Delete group** (confirmed). Removing a member deletes their `memberships` row only.

### Invite / Leave (⋮)
- **Invite** (all members): shows / shares the permanent link.
- **Leave group** (all members): deletes the person's `memberships` row. If the leaver was the admin, auto-promote the oldest remaining member; if none remain, delete the group.

### Logging (unchanged shape, global effect)
The Log flow is unchanged from the player's view — pick a game, paste/enter the result — but an entry now attaches to the **user** and appears on the global board and every group the user is in that tracks that game. The game picker offers the full catalog (today's-due first).

### Admin panel (owner only)
Hidden for everyone but the platform super-admin. Contents in C: master **Games** catalog management (add/edit/deactivate games) and the existing **Players** view. **No "Groups"/analytics tab in C** — that arrives with the analytics workstream.

## Migration (additive-then-cutover, on live prod)

The riskiest part: `entries`, `players`, and `games` are core tables. Follow the identity-rebuild playbook — additive columns first, backfill, switch reads/writes, then drop legacy — with a **prod backup branch + tag before cutover**.

1. **Additive:** add `users.display_name` (backfill from each user's single `players.display_name`), `users.is_super_admin` (set true for the owner), `entries.user_id` (backfill via `player_id → players.user_id`), `groups.created_by`; create `group_games`; add the global name-uniqueness index (verify no collisions among the 5 names first).
2. **Repurpose:** `players` → `memberships` semantics (drop `display_name`/`pin_hash`); games become catalog (retire `group_id` usage); `invites` → permanent-link shape.
3. **Cutover:** switch all read/write paths to user-scoped entries + global identity + catalog games + membership-filtered boards. Retire `g1`-as-a-group: its 14 games become the master catalog and its 5 members become plain global users (no starter group is auto-created; anyone can make one later).
4. **Cleanup:** drop `join_eligibility`, legacy passphrase/pin columns, and vestigial `entries.group_id`/`games.group_id` once nothing references them.

At cutover there are **zero user-created groups** — everyone is simply on the global board, exactly as today, but on the new model. Groups appear only when people create them.

## Security & correctness requirements

- **DB is source of truth** for identity, membership, and roles. The JWT continues to carry only `userId`.
- **Server-side authz on every mutating endpoint:**
  - Create group / join via link: any authenticated user.
  - Manage/rename/curate-games/remove-member/delete-group: only the group's `role='admin'` (verified server-side against `memberships`, not client-supplied).
  - Catalog management: only `users.is_super_admin`.
  - Rename self: only the caller's own `users.display_name` (extends the existing `/api/me/rename`).
- **Membership derived server-side** for board queries — a client cannot request a group board it doesn't belong to (except the always-public global board).
- **Invite tokens hash-only at rest** (sha256), matching existing invite handling.
- **Global name uniqueness** enforced by a DB unique index (case-insensitive), with a clean 409 on collision (reuses the pattern shipped for username changes).
- **Auto-promote-on-admin-leave and last-member-delete** are atomic (single conditional statement / careful ordering under the stateless Neon HTTP driver — no interactive transactions).
- **CI stays green and the build stays secret-free.** Production deploy gets a backup branch + tag first. **No production merge or prod DB change without the owner's explicit go-ahead.**

## Testing strategy

- **Pure logic (node env):** board-filtering (members × tracked games), auto-promote-oldest selection, last-member-delete decision, global name-uniqueness/clash.
- **API route tests (mocked DB):** authz matrix (member vs group-admin vs super-admin vs outsider) for every mutating endpoint; join-via-link (new member, already-member no-op, bad token); create-group defaults; leave/remove semantics; entry writes attach to `user_id` and surface on the right boards.
- **Component tests (jsdom):** board-switcher dropdown (Global pinned + groups + New group), overflow menu role split, create-group form, manage screen, join confirm screen.
- **Migration:** a dry-run/backfill verification script (counts match: every entry gets a `user_id`; every user gets a `display_name`; no name collisions) run against a preview branch before prod.

## Out of scope (explicit)

- Analytics dashboard and platform-wide group/player oversight (separate workstream).
- Discoverable/public groups, group directories, join approval flows.
- Per-group timezones, per-group display names, multiple super-admins.
- Group-specific/offline games (workstream D) — the catalog is universal puzzles for now.

## Suggested rollout (for the implementation plan)

The plan should consider splitting execution into two phases to de-risk the migration:
- **Phase 1 — Foundation reshape:** move identity/results to the global model (display_name on user, entries user-scoped, games as catalog, global name uniqueness). App still shows a single global board and behaves as today, but on the new data model. Ships and is verified on its own.
- **Phase 2 — Group features:** memberships, create/join/manage/leave, board switcher, per-group games, overflow menu, roles + auto-promote.

This keeps the dangerous data migration separable from the user-facing feature work.
