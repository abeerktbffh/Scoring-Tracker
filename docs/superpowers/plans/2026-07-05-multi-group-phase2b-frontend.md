# Multi-Group Phase 2b — Frontend (board switcher, overflow menu, create/join/manage) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Phase 2a group backend into the UI — a board-switcher dropdown (Global + your groups + New group), an overflow (⋮) menu (Manage/Invite/Leave), and create/join/manage-group screens — so a person can create groups, join via link, switch boards, and manage their own group, with the global board unchanged as the default.

**Architecture:** A `BoardContext` provider mounted in `AppShell` holds the selected board (`null` = Global) and the user's group list, persists the selection to `localStorage`, and exposes `useBoard()`. The top bar renders a `BoardSwitcher` (dropdown title) and, when a group is selected, a `GroupOverflowMenu` (⋮). Home/Standings/You read `useBoard().boardId` and thread it as the `group` arg into their existing `getMe`/`getLeaderboard`/`getBoard`/`getGames` calls (all already accept an optional `group?`). Create/join/manage are rendered as full-screen overlays driven by `useBoard` + local UI state; `?join=<token>` in the URL triggers the join-confirm flow. Two small overlay/menu primitives (modeled on `Drawer`) are added since none exist.

**Tech Stack:** Next.js 14.2 App Router, React 18, TypeScript, CSS Modules + design tokens, Vitest + jsdom + @testing-library/react.

## Global Constraints

- **Design tokens only:** every color via `var(--token)` from `src/design/tokens.css` (`--bg,--surface,--ink,--muted,--line,--accent (#10756a),--accent-2 (#e0952f),--me-bg,--scrim,--shadow-card`, radii `--r-tile/-card/-pill`, spacing `--space-1..6`). NO hardcoded hex. Fonts: `--font-display` (Fraunces) for headings, `--font-ui` (Inter) for UI.
- **Reuse existing primitives** (`Button` variants primary/amber/ghost, `Card`, `EmptyState`, `ErrorState`, `Skeleton`, `Segmented`, `Chip`) — don't reinvent them. New overlay/menu primitives model the `Drawer` pattern (backdrop + panel, `role="dialog"`/`aria-modal`, Esc/backdrop close, focus behavior).
- **Component tests:** each `*.test.tsx` starts with `// @vitest-environment jsdom`, uses `@testing-library/react`, mocks `@/lib/api`, `@/lib/currentBoard`, `next/navigation`, `next-auth/react` as needed.
- **Server is source of truth:** the UI never assumes a role; it reflects what `listMyGroups` returns (`role: "admin"|"member"`) and lets the server reject (a 403 surfaces as an error). Group/board selection is a client convenience; every fetch is still server-gated.
- **Copy** from the approved mockups (`.superpowers/brainstorm/82404-1783183682/content/`): board-switcher (Global pinned + ✓, groups, `+ New group`), overflow menu (admin: Manage/Invite/Leave; member: Invite/Leave; none on Global), create (name + game checklist all-on), join confirm ("Join <name>?"), manage (rename, tracked games, members+Remove, Reset link, Delete group).
- **CI green + build secret-free.** No prod merge/DB change without the owner's explicit go-ahead. Phase 2b stacks on `feat/multi-group-phase2` (continues the same branch) and ships in the coordinated Phase 1+2 release.
- **Invite semantics (owner decision):** any member sees/copies the CURRENT link (`getGroupInvite` → `{link}`); only an admin can Reset it (`resetGroupInvite` → new `{link}`).

## Phase 2a interfaces this plan consumes (client, already present in `src/lib/api.ts`)
`createGroup(name,gameIds)→{id,link}`, `listMyGroups()→{groups:[{id,name,role}]}`, `joinGroup(token)→{ok,groupId}`, `getGroupPreview(token)→{group:{id,name,memberCount,gameCount}}`, `getGroupInvite(groupId)→{link}`, `resetGroupInvite(groupId)→{link}`, `renameGroup(groupId,name)→{ok}`, `deleteGroup(groupId)→{ok}`, `setGroupGames(groupId,gameIds)→{ok}`, `removeMember(groupId,userId)→{ok}`, `leaveGroup(groupId)→{ok}`. Reads accept an optional trailing `group?`: `getLeaderboard(window?,player?,group?)`, `getBoard(gameId,window?,player?,group?)`, `getMe(player,group?)`, `getGames(group?)`. All return `ApiResult<T>`.

**Note — member list for Manage:** the manage screen needs the group's member list (names + userIds) to render Remove buttons. Phase 2a did NOT ship a "list group members" read. **Task 7 adds it** (`GET /api/groups/[groupId]/members` → `requireMember` → `{members:[{userId,displayName,role}]}`, plus `listGroupMembers` lib fn + `getGroupMembers` client fn). This is the one backend addition in 2b.

---

## File structure
- `src/design/icons.tsx` — add `ChevronDown`, `Ellipsis` (⋮) icons (Task 1).
- `src/lib/currentBoard.ts` (+test) — **new**: persist selected group id (`st.group`) (Task 1).
- `src/components/BoardContext.tsx` (+test) — **new**: `BoardProvider` + `useBoard()` (Task 2).
- `src/components/Menu.tsx` (+test) — **new**: a reusable anchored dropdown/menu overlay (backdrop + list), modeled on Drawer (Task 3).
- `src/components/BoardSwitcher.tsx` (+test) — **new**: the title dropdown (Task 4).
- `src/components/GroupOverflowMenu.tsx` (+test) — **new**: the ⋮ menu + its actions (Task 5).
- `src/components/CreateGroup.tsx` (+test) — **new**: create-group overlay (Task 6).
- `src/components/JoinGroup.tsx` (+test) — **new**: join-confirm overlay + `?join=` handling (Task 8).
- `src/components/ManageGroup.tsx` (+test) — **new**: manage-group settings overlay (Task 9).
- `src/components/AppShell.tsx` (+ `shell.test.tsx`) — mount `BoardProvider`, top-bar switcher + overflow, `?join=` handling (Tasks 2,4,5,8).
- `src/app/(app)/page.tsx`, `src/app/(app)/standings/page.tsx`, `src/app/(app)/you/page.tsx` (+ tests) — thread `useBoard().boardId` into fetches (Task 7... see below; page-threading is Task 10).
- `src/components/Drawer.tsx` — replace the "Group — Coming soon" stub (Task 11).
- Backend member-list: `src/lib/groups.ts`, `src/app/api/groups/[groupId]/members/route.ts` (+test), `src/lib/api.ts` (Task 7-backend, done first).

---

## Task 1: Icons + current-board persistence

**Files:** Modify `src/design/icons.tsx`; Create `src/lib/currentBoard.ts` (+`currentBoard.test.ts`).

**Interfaces produced:** `ChevronDown`, `Ellipsis` (both `IconProps{size?,className?}`); `loadBoardId(): string | null` (null = Global), `saveBoardId(id: string | null): void` (null clears), `BOARD_STORAGE_KEY = "st.group"`.

- [ ] **Step 1: Failing test** `src/lib/currentBoard.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { loadBoardId, saveBoardId } from "./currentBoard";
beforeEach(() => localStorage.clear());
describe("currentBoard", () => {
  it("defaults to null (Global)", () => { expect(loadBoardId()).toBeNull(); });
  it("round-trips a group id", () => { saveBoardId("grp_1"); expect(loadBoardId()).toBe("grp_1"); });
  it("saving null clears it", () => { saveBoardId("grp_1"); saveBoardId(null); expect(loadBoardId()).toBeNull(); });
});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/lib/currentBoard.ts` (mirror `rememberMe.ts` guarding `typeof window`):
```ts
export const BOARD_STORAGE_KEY = "st.group";
export function loadBoardId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(BOARD_STORAGE_KEY) || null;
}
export function saveBoardId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(BOARD_STORAGE_KEY, id);
  else window.localStorage.removeItem(BOARD_STORAGE_KEY);
}
```
Add to `src/design/icons.tsx` (match the existing icon style — `viewBox="0 0 24 24"`, `stroke="currentColor"` or `fill`, using `size`/`className`):
```tsx
export function ChevronDown({ size = 20, className }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M6 9l6 6 6-6" /></svg>);
}
export function Ellipsis({ size = 20, className }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>);
}
```
- [ ] **Step 4: Run** `npm test -- src/lib/currentBoard.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(ui): current-board persistence + chevron/ellipsis icons"`

---

## Task 2: `BoardContext` provider + `useBoard()`

**Files:** Create `src/components/BoardContext.tsx` (+`BoardContext.test.tsx`).

**Interfaces produced:** `type Board = { id: string; name: string; role: "admin"|"member" }`. `useBoard(): { boardId: string | null; board: Board | null; groups: Board[]; loading: boolean; select(id: string | null): void; refresh(): Promise<void> }`. `<BoardProvider>{children}</BoardProvider>`.
- `boardId === null` ⇒ Global. `board` = the selected Board (or null for Global). `select` persists via `saveBoardId` and updates state. `refresh` re-fetches `listMyGroups`. On mount: load persisted id, fetch groups; if the persisted id isn't among the returned groups (e.g., left/deleted), fall back to Global.

- [ ] **Step 1: Failing test** `src/components/BoardContext.test.tsx` — render a probe component that calls `useBoard`, mock `@/lib/api` `listMyGroups` and `@/lib/currentBoard`:
```ts
// @vitest-environment jsdom
// mock listMyGroups → {ok:true,data:{groups:[{id:"g1",name:"Fam",role:"admin"}]}}
// assert: after load, groups has 1 entry, boardId defaults to persisted (null), select("g1") sets boardId + calls saveBoardId, selecting an id not in groups resets to null.
```
(Write concrete cases: initial global; select persists; stale persisted id → Global fallback after groups load.)
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `BoardContext.tsx` (`"use client"`): a context with the state above; `useEffect` on mount loads `loadBoardId()` then `listMyGroups()`, reconciles (drop selection if not a member), exposes `select` (calls `saveBoardId` + setState) and `refresh`. `board` derived via `groups.find(g => g.id === boardId) ?? null`. Guard `useBoard` to throw if used outside the provider.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Mount** in `AppShell` — wrap the authed shell subtree (the branch that renders `<header>/<main>/<TabBar>/<Drawer>`) in `<BoardProvider>`. Update `shell.test.tsx` to keep passing. Run `npm test -- src/components/BoardContext.test.tsx src/components/shell.test.tsx`.
- [ ] **Step 6: Commit** — `git commit -am "feat(ui): BoardContext provider + useBoard hook, mounted in AppShell"`

---

## Task 3: `Menu` overlay primitive

**Files:** Create `src/components/Menu.tsx` (+`Menu.test.tsx`), `Menu.module.css`.

**Interfaces produced:** `<Menu open onClose title? ...>{children}</Menu>` — a backdrop + a panel (top-anchored sheet, mobile-friendly) modeled on `Drawer`: `role="dialog"`, `aria-modal`, backdrop `onClick=onClose`, Escape closes, tokens-only. Plus `<MenuItem onClick icon? danger?>label</MenuItem>` and `<MenuLabel>` for section headers. Purely presentational (parent controls `open`).

- [ ] **Step 1: Failing test** — open renders children + a dialog; backdrop click and Escape call `onClose`; a `MenuItem` click fires its handler; `danger` item gets the danger class.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** modeled on `Drawer.tsx` (backdrop div with `styles.backdrop`/`backdropOpen`, panel with `styles.panel`/`panelOpen`, `aria-hidden={!open}`, an Escape `keydown` listener in a `useEffect` gated on `open`). `MenuItem` = a `<button className={styles.item + (danger?...)}>` with optional leading icon. Tokens only.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(ui): Menu overlay primitive (backdrop + anchored sheet, Esc/backdrop close)"`

---

## Task 4: `BoardSwitcher` (title dropdown) + top-bar mount

**Files:** Create `src/components/BoardSwitcher.tsx` (+test), `BoardSwitcher.module.css`; Modify `src/components/AppShell.tsx`.

**Interfaces produced:** `<BoardSwitcher onNewGroup={() => void} />` — renders the current board's title ("Global" or the group name) + a `ChevronDown`; tapping opens a `Menu` listing **Global** (pinned top, ✓ when selected) then each of `useBoard().groups` (✓ on the selected), then a divider and a tinted **+ New group** action (calls `onNewGroup`). Selecting a board calls `useBoard().select(id)` and closes.

- [ ] **Step 1: Failing test** — mock `useBoard` (provide groups + select spy); assert: closed state shows the current board name; opening lists Global + groups + "New group"; clicking a group calls `select(id)`; clicking Global calls `select(null)`; clicking New group calls `onNewGroup`; the selected board shows a ✓.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** using `Menu`/`MenuItem`/`MenuLabel` + `useBoard`. Title button uses `--font-display`. ✓ via the `Check` icon.
- [ ] **Step 4: Mount in AppShell top bar** — replace the bare menu-button header (`AppShell.tsx:126-135`) so it contains: the ☰ menu button (unchanged), the `<BoardSwitcher onNewGroup={...}>` as the title, and (Task 5) the overflow button. Wire `onNewGroup` to open the CreateGroup overlay (Task 6 adds the state; for now a stub `onNewGroup` prop threaded from AppShell state). Update `shell.test.tsx`.
- [ ] **Step 5: Run** `npm test -- src/components/BoardSwitcher.test.tsx src/components/shell.test.tsx` → PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(ui): BoardSwitcher dropdown (Global + groups + New group) in the top bar"`

---

## Task 5: `GroupOverflowMenu` (⋮) + Invite/Leave actions

**Files:** Create `src/components/GroupOverflowMenu.tsx` (+test); Modify `AppShell.tsx`.

**Interfaces produced:** `<GroupOverflowMenu onManage={() => void} />` — renders NOTHING when `useBoard().board` is null (Global) OR undefined. For a selected group: an `Ellipsis` button opening a `Menu` with — **admin** (`board.role === "admin"`): **Manage group** (→ `onManage`), **Invite**, **Leave group**; **member**: **Invite**, **Leave group**.
- **Invite:** calls `getGroupInvite(board.id)`; on ok shows the link with a Copy button (writes `navigator.clipboard`); on error shows a message. (Render the link in the same Menu or a small sub-panel.)
- **Leave group:** confirms, calls `leaveGroup(board.id)`; on ok calls `useBoard().select(null)` (back to Global) + `useBoard().refresh()`.

- [ ] **Step 1: Failing test** — mock `useBoard` + `@/lib/api`. Cases: null board → renders nothing; admin board → menu has Manage/Invite/Leave; member board → Invite/Leave only (no Manage); Invite → calls `getGroupInvite` and shows the returned link; Leave → calls `leaveGroup` then `select(null)`+`refresh`; `onManage` fired for Manage.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with `Menu`. Guard the null-board render first. Copy uses `navigator.clipboard.writeText` (guard for absence in tests).
- [ ] **Step 4: Mount** the overflow button in the AppShell top bar (right side), passing `onManage` (opens ManageGroup overlay — Task 9 adds the state; thread the prop now). Update `shell.test.tsx`.
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(ui): group overflow menu (Manage/Invite/Leave, role-split) + invite/leave actions"`

---

## Task 6: `CreateGroup` overlay

**Files:** Create `src/components/CreateGroup.tsx` (+test), `CreateGroup.module.css`; Modify `AppShell.tsx` (state to open it from BoardSwitcher's `onNewGroup`).

**Interfaces produced:** `<CreateGroup open onClose onCreated={(groupId) => void} />` — a full overlay: a name input + a checklist of the catalog games (fetched via `getGames()`, all checked by default) + a Create button. Submit → `createGroup(name, checkedGameIds)`; on `{id, link}` success: show the shareable link with Copy, then `onCreated(id)` (AppShell selects the new group + refreshes groups). Validation: empty name disables Create; a 400 surfaces the server message.

- [ ] **Step 1: Failing test** — mock `@/lib/api` `getGames`+`createGroup`. Cases: renders the game checklist (all checked); Create disabled when name empty; submitting calls `createGroup(name, gameIds)`; success shows the link + Copy and calls `onCreated(id)`; a `{ok:false}` shows the error.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** using `Button`, tokens; game checklist from `getGames()`. Uncheck toggles removal from `gameIds`.
- [ ] **Step 4: Wire in AppShell** — `onNewGroup` (from BoardSwitcher) sets `createOpen=true`; `onCreated(id)` → `board.select(id)` + `board.refresh()` + close. Update `shell.test.tsx`.
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(ui): create-group overlay (name + game checklist) wired to the switcher"`

---

## Task 7: Group member list (backend addition) + client fn

**Files:** Modify `src/lib/groups.ts` (+`groups.test.ts`); Create `src/app/api/groups/[groupId]/members/route.ts` (+test); Modify `src/lib/api.ts` (+`api.test.ts`).

**Interfaces produced:** `listGroupMembers(groupId): Promise<{ userId: string; displayName: string | null; role: "admin"|"member" }[]>`; `GET /api/groups/[groupId]/members` (`requireMember`) → `{members}`; client `getGroupMembers(groupId): Promise<ApiResult<{ members: {userId; displayName; role}[] }>>`.

- [ ] **Step 1: Failing tests** — `groups.test.ts`: `listGroupMembers` joins memberships→users, returns `{userId,displayName,role}` ordered by role then name. Route test: `requireMember`-gated (403 non-member), `{members}` on success. `api.test.ts`: `getGroupMembers` GET URL.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — lib:
```ts
export async function listGroupMembers(groupId: string) {
  const rows = (await sql`
    SELECT m.user_id, u.display_name, m.role FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.group_id = ${groupId}
    ORDER BY (m.role = 'admin') DESC, u.display_name
  `) as { user_id: string; display_name: string | null; role: "admin" | "member" }[];
  return rows.map((r) => ({ userId: r.user_id, displayName: r.display_name, role: r.role }));
}
```
Route: `requireMember(params.groupId)` → `{ members: await listGroupMembers(params.groupId) }`. Client `getGroupMembers`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(groups): list group members (member-gated) + client fn"`

---

## Task 8: `JoinGroup` overlay + `?join=` handling

**Files:** Create `src/components/JoinGroup.tsx` (+test), `JoinGroup.module.css`; Modify `src/components/AppShell.tsx` (+`shell.test.tsx`).

**Interfaces produced:** `<JoinGroup token onClose onJoined={(groupId) => void} />` — on mount calls `getGroupPreview(token)`; shows "Join <name>?" with member/game counts + Join / Not now; Join → `joinGroup(token)` → `onJoined(groupId)`. Invalid token → an error state with a dismiss.

- [ ] **Step 1: Failing test** — mock `getGroupPreview`+`joinGroup`. Cases: preview shows name+counts; Join calls `joinGroup(token)` then `onJoined(groupId)`; invalid preview (`{ok:false}`) shows the error; Not now calls `onClose`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the overlay.
- [ ] **Step 4: Wire `?join=` in AppShell** — add `useSearchParams` (already Suspense-wrapped). In an effect after `authed`, read `searchParams.get("join")`; if present, set `joinToken` state (render `<JoinGroup token onJoined>` over the shell). `onJoined(groupId)` → `board.refresh()` + `board.select(groupId)` + clear the token from the URL (via `history.replaceState` to strip `?join=`) + close. Signed-out users hit `SignInGate` first (the existing gate runs before this), then land back with the param intact. Update `shell.test.tsx` (it already mocks `useSearchParams`).
- [ ] **Step 5: Run** `npm test -- src/components/JoinGroup.test.tsx src/components/shell.test.tsx` → PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(ui): join-via-link (?join=) preview+confirm flow"`

---

## Task 9: `ManageGroup` overlay (admin)

**Files:** Create `src/components/ManageGroup.tsx` (+test), `ManageGroup.module.css`; Modify `AppShell.tsx` (open from overflow's `onManage`).

**Interfaces produced:** `<ManageGroup groupId onClose onChanged() onDeleted() />` — an admin settings overlay: rename (input + Save → `renameGroup`), tracked games (checklist from `getGames()` prechecked to the group's current set — derive current set from `getGames(groupId)` which returns only the group's tracked-active games — Save → `setGroupGames`), member list (`getGroupMembers` → each with a **Remove** button except self/admin → `removeMember` then refresh the list), **Reset link** (`resetGroupInvite` → show new link + Copy), and **Delete group** (confirm → `deleteGroup` → `onDeleted`). `onChanged` re-fetches groups (name change reflects in the switcher); `onDeleted` selects Global + refreshes.

- [ ] **Step 1: Failing test** — mock `@/lib/api` (`getGames`, `getGroupMembers`, `renameGroup`, `setGroupGames`, `removeMember`, `resetGroupInvite`, `deleteGroup`). Cases: renders current name + members; rename calls `renameGroup` + `onChanged`; toggling games + Save calls `setGroupGames` with the new set; Remove calls `removeMember` then re-lists; Reset link calls `resetGroupInvite` and shows the new link; Delete (confirmed) calls `deleteGroup` + `onDeleted`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** To get "all catalog games with which are tracked", fetch BOTH `getGames()` (full catalog) and `getGames(groupId)` (tracked subset); precheck the tracked ids. Use `Button` variants (`ghost` for Cancel, a danger style for Delete via a token-based class).
- [ ] **Step 4: Wire in AppShell** — overflow `onManage` → `manageOpen=true` for `board.id`; `onChanged`→`board.refresh()`; `onDeleted`→`board.select(null)`+`board.refresh()`+close. Update `shell.test.tsx`.
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(ui): manage-group overlay (rename, games, members/remove, reset link, delete)"`

---

## Task 10: Thread the selected board into Home / Standings / You

**Files:** Modify `src/app/(app)/page.tsx`, `src/app/(app)/standings/page.tsx`, `src/app/(app)/you/page.tsx` (+ their tests).

**Behavior:** each page reads `const { boardId } = useBoard()` and passes `boardId ?? undefined` as the `group` arg to its fetches, and RE-FETCHES when `boardId` changes (add `boardId` to the relevant effect deps / `load` callback). Global (`boardId===null`) → the current global behavior, unchanged.
- Home (`page.tsx`): `getMe(name ?? "", boardId ?? undefined)` + `getLeaderboard("weekly", name ?? undefined, boardId ?? undefined)`; re-run `load` on `boardId`. Also replace the `<h1>Home</h1>` — the BoardSwitcher in the top bar now names the board, so change the `<h1>` to a section-appropriate heading or keep "Home" (the switcher is the board label; keep "Home" as the page label — the plan keeps `<h1>` but it's no longer the board identifier). Keep it simple: leave `<h1>Home</h1>`.
- Standings (`standings/page.tsx`): thread `boardId` into `loadOverall`/`loadGames`/`loadBoard`; re-run on `boardId`. When the board changes, re-select the first game of that board (games list is now group-scoped).
- You (`you/page.tsx`): `getMe`/`getLeaderboard` — thread `boardId` so "You" reflects the selected board's context (its rank line). (If simpler to keep You global, note it — but the spec's boards apply to standings/home; You is personal. DECISION: keep You reading GLOBAL always — do NOT thread boardId into You; it's the person's own global profile.) So Task 10 modifies only Home + Standings; You stays global.

- [ ] **Step 1: Failing tests** — Home test: with `useBoard` mocked to a group, `getMe`/`getLeaderboard` are called with the group id; changing boardId refetches. Standings test: same threading + first-game reselect on board change. (You test unchanged.)
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the threading in Home + Standings; add `boardId` to deps.
- [ ] **Step 4: Run** the page tests → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(ui): Home + Standings honor the selected board (group-scoped reads)"`

---

## Task 11: Drawer "Group" stub → real; full green-gate

**Files:** Modify `src/components/Drawer.tsx` (+`drawer` test if present).

- [ ] **Step 1:** Replace the disabled "Group — Coming soon" stub (`Drawer.tsx:33-36`) with a live entry: a "Groups" item that closes the drawer and opens the BoardSwitcher (or simply remove the stub, since the top-bar switcher now covers group navigation). DECISION: replace the stub with a non-disabled "New group" shortcut that triggers the same create flow (thread a callback), OR remove it. Keep minimal: **remove the disabled stub** (the switcher supersedes it); leave Admin/Settings/Sign out.
- [ ] **Step 2:** Update any Drawer test.
- [ ] **Step 3: Full green-gate** — `npm run typecheck && npm test && npm run lint && DATABASE_URL='postgres://u:p@localhost/db' AUTH_SECRET='x-at-least-32-bytes-xxxxxxxxxxxxxx' npm run build`. All pass.
- [ ] **Step 4: Commit** — `git commit -am "chore(ui): retire the Drawer 'Group coming soon' stub; Phase 2b green"`

---

## Self-review

**Spec coverage (Phase 2b):** board switcher (T4), overflow menu + Invite/Leave (T5), create (T6), join-via-link (T8), manage incl. rename/games/members/reset/delete (T9), member list backend (T7), board-scoped Home/Standings (T10), selection persistence + context (T1,T2), primitives (T3), drawer cleanup (T11). Invite = member-view-current + admin-reset (T5,T9), per owner decision. ✓
**Deferred/decisions:** You stays global (T10); Drawer stub removed not rebuilt (T11); super-admin Groups panel is NOT in scope (separate analytics workstream, per spec).
**Placeholder scan:** the two DECISION notes (You-global, Drawer-remove) are resolved inline, not deferred. Every component step has real code or a precise prop contract + test list.
**Type consistency:** `useBoard()` shape (`boardId/board/groups/select/refresh`) consistent across T2/T4/T5/T10; `Board` type `{id,name,role}` matches `listMyGroups`; overlays share the `open/onClose/on…` prop pattern; `getGroupMembers` member shape `{userId,displayName,role}` consistent T7↔T9.

## Deploy note
Phase 2b is frontend + one member-list read (additive, no schema change). It ships in the coordinated Phase 1+2 release; the only DB work remains Phase 1's backfill + Phase 2a's additive DDL, applied at the same gated step. No prod change without the owner's explicit go-ahead.
