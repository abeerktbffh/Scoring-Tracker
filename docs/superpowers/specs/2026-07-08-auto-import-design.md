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

One authenticated **capture endpoint** + a **per-user import token**; every capture client is a thin front-end that speaks to that endpoint.

```
Android: game Share → PWA share_target handler (session auth) ─┐
iPhone:  game Share → Bragboard Shortcut (token auth) ─────────┤→ capture endpoint
Future:  native app Share Extension (token auth) ──────────────┘   → detectAndParse
                                                                    → existing entries write
                                                                      (dedup / supersede / late)
```

## Components

### 1. Capture endpoint
A single authenticated `POST` accepting the shared result text (`rawInput`). It runs the **existing** parse-and-save path (`detectAndParse` → the entries write with its one-active-entry-per-user/game/day/variant dedup + supersede + late handling) and returns a friendly confirmation (e.g. `"Logged Wordle 3/6 ✓"`) or a clear error. Because entries are **per-user** (they already surface in every group the user is in that tracks the game), an import needs **no group selection**. Reuses `resolveSubmission`/`detectAndParse` and the entries insert; adds no new ranking or write-race surface.

### 2. Per-user import token
A secret generated on demand in settings, stored **hashed** (same pattern as the group invite tokens). Auth resolution: a request bearing a valid token resolves to that user; a normal browser session continues to work as today. **Reset** regenerates and revokes the old one. This token is the through-line to the native app (native apps can't use a web cookie).

### 3. Android capture
A `share_target` entry in the PWA manifest + a small handler route that receives the shared text and calls the capture endpoint using the installed PWA's **session** (no token needed on Android). Setup = **"Install app."**

### 4. iPhone capture
A **personalized** Bragboard Shortcut that appears in the share sheet, takes the shared text, and POSTs it with the user's token. The intent is that the token is **baked into the shortcut during setup** — the user never sees or copies a token string. Implementation must confirm the token-injection mechanism on iOS (a personalized shortcut download vs. a first-run handshake that fetches the token from the logged-in Bragboard session); **fallback** if neither is practical: a single one-time paste of the token during setup — still one-time, still no per-use friction.

### 5. Guided setup UX (first-class)
A single **"Set up auto-log"** screen in settings, **platform-aware** — detects iPhone vs Android and shows only that person's steps:
- **Android:** one **"Install app"** button → "✓ You're set — try sharing a result."
- **iPhone:** at most three action-first steps, one tap each — (1) **Add the Bragboard shortcut** (personalized, token pre-baked); (2) **Allow it** (one-time iOS prompt); (3) note that the first share may require **"More" → enable Bragboard** in the share sheet, with a simple illustration.
- **Live "test it":** "Share any result now" — the screen flips to a green ✓ the moment the first import lands, so the user knows it worked.
- Copy is plain and outcome-focused ("You'll never copy-paste again"); no "manifest," "token," or "share_target" jargon shown to users.

Honest note: iPhone is inherently a couple more taps than Android until the native app; the platform-detected one-button-per-step flow with a live success check makes it about as painless as iOS allows.

## Data flow

1. User finishes a game and taps its **Share**.
2. Android → the PWA share handler (session); iPhone → the Shortcut (token). Both send the shared **text**.
3. Capture endpoint authenticates (session or token), runs `detectAndParse`, writes via the existing entries path.
4. Client shows a confirmation; the result is now on the user's boards (visible on next board open — live push is roadmap B).

## Error handling / edge cases

- **Unreadable / unsupported / image share** → "Couldn't read that result — make sure it's the *Share* from a supported game." Nothing written (reuses the existing parse-fail → 422).
- **Duplicate / re-share same day** → existing supersede keeps the latest; user sees "Updated your result," never a double.
- **Past-day result** → existing late-entry rules (flagged, excluded from wins/streaks); no new behavior.
- **Game not active/tracked** (e.g. a deactivated game) → clear "That game isn't active right now," not a silent no-op.
- **Invalid/revoked token (iPhone)** → "Your auto-log setup needs refreshing" → re-run the one-button setup.
- **Concurrency** → unchanged; imports ride the existing unique-index + `23505` write path, adding no new race.

## Testing strategy

- **Endpoint** (extends existing entries tests): session auth AND token auth; each result shape parses and writes; unparseable → 422 no-write; duplicate → supersede; inactive game → rejected; bad/missing token → 401.
- **Token lib**: generate / hash / resolve / reset — mirrors the invite-token tests.
- **Android share handler**: receives shared text → calls the endpoint.
- **Setup screen** (jsdom): platform detection shows the correct steps; success state flips on a confirmed import.
- **iOS Shortcut**: not unit-testable in CI (an Apple artifact) — covered by a documented manual validation checklist; the built-in "test it" confirm is the real end-to-end proof.

## Rollout / deploy

Standard gated process (nothing to prod without the owner's explicit go-ahead). Includes one **small additive schema change** — storage for the per-user import token (hashed) — applied with the same discipline as the leaderboard release (backup → migrate → deploy → merge). Additive and backward-compatible.

## Out of scope (parked, not forgotten)

- **Live board updates** — roadmap item B.
- **Native app** — future; the endpoint + token are its foundation, but the app itself is not built here.
- **NYT Mini and any image-only game** — stay manual (nothing parseable to import).
- **Email ingestion, image OCR, server-side scraping, source-site APIs** — not pursued (feasibility ruled out).
- **New game parsers** — reuses the existing 14 as-is.
