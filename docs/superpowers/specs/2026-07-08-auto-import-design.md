# Auto-Import (Workstream E) — Design Spec

**Status:** Draft for review
**Date:** 2026-07-08
**Depends on:** the existing parser/submission/entries stack; the `entries.detail` model (leaderboard redesign, live)
**Enables (roadmap):** live board updates (item B); a native mobile app (the endpoint + token are built as its foundation)

## Goal

Remove the copy-paste step when logging a daily puzzle result. A friend taps the game's native **Share** button and picks Bragboard; the result is parsed and logged with **one tap, no copy / no app-switch / no paste**. Delivered on both Android and iPhone, for the games Bragboard already parses.

## Guiding principles (binding)

- **Keep it simple** (owner-stated, applies to the whole app). The setup flow especially must be as simple as possible — platform-aware, one action per step, plain language, no jargon.
- **Native-app-forward.** A native app is the long-term plan. The durable assets here — one import endpoint + a per-user token — are designed so the future native app plugs into the *same* backend with no changes. Nothing built now is throwaway.
- **Reuse, don't reinvent.** Auto-import feeds the existing "share text → `detectAndParse` → dedup/supersede write" path from a share tap instead of a paste box. No new parsers, no new ranking/scoring logic.
- **One-tap, not zero-tap.** True passive "it knows you played" is not achievable for these games on phones (see Feasibility). The honest, achievable target is one-tap share after a one-time per-person setup.

## Feasibility findings (why the architecture is what it is)

- **No server-side API pull.** LinkedIn Games / NYT / Wordle expose no public API for a third party to read a specific user's daily result. Where an internal endpoint exists it is gated by that user's own login cookie; the base Wordle game keeps results in browser local storage. The data is only reachable inside the player's own logged-in session — so capture must happen on the user's device, not our server. (Harvesting users' source-site credentials is out — brittle, against those sites' terms, a security anti-pattern.)
- **Browser extensions don't fit a phone-first group.** Android Chrome supports no extensions; iOS only via a heavy Safari-extension-in-an-app; and native game apps are invisible to extensions anyway.
- **Web Share Target API is Android-only.** iOS Safari does not support `share_target` for PWAs as of 2026 (WebKit bug #194593 open). So Android gets a clean PWA share target; iPhone needs a Shortcut (now) or a native Share Extension (future). Sources: MDN `share_target`; WebKit #194593; PWA-on-iOS 2026 guides.

## Scope decision

- **Now — Approach A:** frictionless one-tap logging (endpoint + token + Android PWA share target + iOS Shortcut + guided setup), for all existing text-sharing games. Boards refresh on navigation.
- **Roadmap — Approach B:** live board updates (real-time push so an open board shows a new result the instant it lands). Separate real-time layer; not in this build.

## Architecture

The existing **`/api/entries`** write path, taught a second **auth mode** (a per-user token) alongside the session; every capture client is a thin front-end that POSTs `{rawInput}` to it. No new capture endpoint.

```
Android: game Share → PWA share_target handler (session auth) ─┐
iPhone:  game Share → Bragboard Shortcut (token auth) ─────────┤→ POST /api/entries
Future:  native app Share Extension (token auth) ──────────────┘   (session OR token)
                                                                    → detectAndParse
                                                                    → existing entries write
                                                                      (dedup / supersede)
```

## Components

### 1. Capture — extend the existing `/api/entries` (no new endpoint)
`POST /api/entries` **already** does exactly what we need in paste-mode: `{rawInput}` → `resolveSubmission` → `detectAndParse` → `supersedeAndInsert` (the one-active-entry-per-user/game/day/variant dedup + supersede, with the `23505` retry). The web paste UI already POSTs `{rawInput}` there. So we **extend that same endpoint to accept token auth in addition to the session** — we do NOT add a parallel "capture endpoint" (that would duplicate the parse/write/dedup logic and create a second write-race surface). Result:
- **Android** (installed PWA, same-origin, carries the session cookie) → its share handler POSTs `{rawInput}` straight to `/api/entries` with the **session**. No token, no new endpoint.
- **iPhone Shortcut** and **future native app** → POST `{rawInput}` to `/api/entries` with a **token** (see §3).
Because entries are **per-user** (schema has `user_id`, no `group_id`; they surface in every group the user is in that tracks the game), an import needs **no group selection**. Adds no new ranking or write-race surface. Returns a friendly confirmation (`"Logged Wordle 3/6 ✓"`) or a clear error.

### 2. Auth — a new token mode alongside the session
Today auth is session-only: `requireUser()` → `resolveViewer()` reads identity from `auth()` and takes no request argument; there is **no Bearer-token auth anywhere** in the app. This is a genuinely new auth mode, added cleanly:
- A new guard `requireUserOrImportToken(req)` checks the `Authorization: Bearer <token>` header first (resolving it to a user), else falls back to the existing `resolveViewer()` session path. The existing pure/testable authz split stays untouched.
- Token→userId resolution is a small pure-ish lib function that looks a user up by token **hash** (mirrors `joinViaToken`'s hash-lookup).

### 3. Per-user import token (hash-only, write-scoped)
A high-entropy secret (reuse the invite-token **hashing mechanism** — SHA-256 of a 144-bit random value — NOT the invite-token *storage* pattern):
- **Hash-only storage.** Store only `import_token_hash` on `users` (unique partial index). The plaintext is shown/handed to the client **once at generation** and is **never re-displayable** — unlike the group invite token (which deliberately stores plaintext because it's low-sensitivity). This is a **write-capable bearer credential**, so plaintext must not live in the DB.
- **Reset = only recovery.** Regenerate replaces the hash and revokes the old token instantly.
- **Blast radius (state it as mitigation):** a leaked token can only **write the victim's entries** — no read, no account access, no settings — and each write is bounded by the per-day dedup (spam self-supersedes rather than piling up). It can still pollute streaks/wins, so:
- **Rate-limit** the token path with a modest per-token cap. NOTE: the repo's `rateLimit` is in-memory/per-instance (near-useless across serverless instances) — the plan must not rely on it for real protection; use a durable check (e.g. a per-token+day counter) or accept the documented low blast radius.
- This token is the through-line to the native app (native apps can't use a web cookie).

### 4. Android capture
Bragboard is **already an installable PWA** (manifest linked, service worker registered, icons present). The net-new work is small: add the `share_target` member to the manifest + a handler route that receives the shared text and POSTs `{rawInput}` to `/api/entries` (session auth). One caveat: the current service worker returns early for non-GET requests, so use a **GET `share_target`** with url-encoded `text` (simplest, no SW change), or teach the SW to pass POST shares through. Setup = **"Install app."**

### 5. iPhone capture
A Bragboard **Shortcut** that appears in the share sheet, takes the shared text, and POSTs `{rawInput}` to `/api/entries` with the user's token. **Baseline setup is a one-time token paste:** setup shows a "copy this key" button; the friend pastes it into the shortcut once (it's a Shortcut "import question"). We will **spike** slicker token-injection (a personalized shortcut download, or a first-run handshake that fetches the token from the logged-in Bragboard session) as a nice-to-have, but the design does NOT assume it — the honest baseline is one-time paste (still no per-use friction). Because a Shortcut carrying the token can be exported/shared by the user, hash-only storage + easy reset (§3) matter.

### 6. Guided setup UX (first-class)
Note: there is **no settings/account screen in the app today** (only `/api/me`, rename, and `/log`), so this includes building a small **new settings surface** to host it.
A single **"Set up auto-log"** screen in settings, **platform-aware** — detects iPhone vs Android and shows only that person's steps:
- **Android:** one **"Install app"** button → "✓ You're set — try sharing a result."
- **iPhone:** action-first steps, one tap each — (1) **Add the Bragboard shortcut**; (2) **Copy your key** (one tap) and paste it into the shortcut when it asks (the one-time token paste — reframed as "your key", not "token"); (3) **Allow it** (the one-time iOS permission prompt); (4) note that the first share may require **"More" → turn on Bragboard** in the share sheet, with a simple illustration. (If the token-injection spike in §5 pans out, steps collapse and (2) disappears — but the flow is designed to be clear even with the paste.)
- **Live "test it":** "Share any result now" — the screen flips to a green ✓ the moment the first import lands, so the user knows it worked.
- Copy is plain and outcome-focused ("You'll never copy-paste again"); no "manifest," "share_target," or "bearer token" jargon — the one secret the iPhone flow must expose is framed simply as "your key."

Honest note: iPhone is inherently a couple more taps than Android until the native app; the platform-detected one-button-per-step flow with a live success check makes it about as painless as iOS allows.

## Data flow

1. User finishes a game and taps its **Share**.
2. Android → the PWA share handler (session); iPhone → the Shortcut (token). Both send the shared **text**.
3. Capture endpoint authenticates (session or token), runs `detectAndParse`, writes via the existing entries path.
4. Client shows a confirmation; the result is now on the user's boards (visible on next board open — live push is roadmap B).

## Error handling / edge cases

- **Unreadable share — unsupported game, URL-only, or image** → "Couldn't read that result — make sure it's the *Share* from a supported game." Nothing written (reuses the existing parse-fail → 422). The client must forward the **text** field of the share payload; a share that is URL-only or image-only has no parseable text and lands here as the expected 422.
- **Duplicate / re-share same day** → existing supersede keeps the latest; user sees "Updated your result," never a double.
- **Past-day result** → an import behaves **exactly like a manual paste** here — whatever `/api/entries` does today for a past-day submission (it currently inserts with `is_late = false`), it does identically for imports. No new behavior, and no auto-import-specific late logic is introduced.
- **Unknown/inactive game** → the existing write path returns 422 "Unknown game" for anything not in the active catalog; the import client surfaces that as a clear message. (No new "tracked-by-your-group" check is needed — per-user entries correctly surface only in groups that track the game; the write itself is group-agnostic.)
- **Invalid/revoked token (iPhone)** → "Your auto-log setup needs refreshing" → re-run the one-button setup.
- **Concurrency** → unchanged; imports ride the existing unique-index + `23505` write path, adding no new race.

## Testing strategy

- **Endpoint** (extends existing entries tests): session auth AND token auth; each result shape parses and writes; unparseable → 422 no-write; duplicate → supersede; inactive game → rejected; bad/missing token → 401.
- **Token lib**: generate / hash / resolve / reset — mirrors the invite-token tests.
- **Android share handler**: receives shared text → calls the endpoint.
- **Setup screen** (jsdom): platform detection shows the correct steps; success state flips on a confirmed import.
- **iOS Shortcut**: not unit-testable in CI (an Apple artifact) — covered by a documented manual validation checklist; the built-in "test it" confirm is the real end-to-end proof.

## Build order (decomposition)

Ship in three pieces so the backend value lands (and de-risks) first:

0. **Pre-flight (no code):** enumerate the actual **mobile share payload** for each of the 14 supported games — does its native Share emit parseable grid/score **text**, a URL, or an image? Record which games are import-eligible; URL/image-only games stay manual. This gates what the clients can extract.
1. **Backend foundation** — `import_token_hash` on `users` (+ unique partial index, additive migration); the token lib (generate/hash/resolve/reset, hash-only); the `requireUserOrImportToken` guard; extend `/api/entries` to accept token *or* session; per-token rate-limit. Fully unit-testable, delivers standalone value, and **is** the native-app foundation.
2. **Android capture** — `share_target` manifest member (GET + url-encoded `text`) + the handler route → posts to `/api/entries` (session).
3. **iPhone capture + guided setup UX** — the Shortcut (token paste baseline) + the new platform-aware settings surface with the live "test it" confirm.

Each piece is its own reviewable unit; piece 1 could even ship on its own.

## Rollout / deploy

Standard gated process (nothing to prod without the owner's explicit go-ahead). Includes one **small additive schema change** — storage for the per-user import token (hashed) — applied with the same discipline as the leaderboard release (backup → migrate → deploy → merge). Additive and backward-compatible.

## Out of scope (parked, not forgotten)

- **Live board updates** — roadmap item B.
- **Native app** — future; the endpoint + token are its foundation, but the app itself is not built here.
- **NYT Mini and any image-only game** — stay manual (nothing parseable to import).
- **Email ingestion, image OCR, server-side scraping, source-site APIs** — not pursued (feasibility ruled out).
- **New game parsers** — reuses the existing 14 as-is.
