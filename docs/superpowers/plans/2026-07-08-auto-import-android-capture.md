# Auto-Import — Android Capture (Piece 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an Android user log a result by tapping a game's **Share** and picking Bragboard — the installed PWA receives the shared text and posts it to the existing `/api/entries` (session auth), with a clear logged/error outcome.

**Architecture:** Add a `share_target` member (GET, url-encoded `text`) to the static PWA manifest so the installed app appears in Android's share sheet. Add a thin client handler page at `/share-target` that reads the shared `text` from the query string and calls the existing `postEntry({ rawInput })` helper (which POSTs to `/api/entries` with the session cookie — no token needed on Android). No backend change; no service-worker change (GET navigations already pass through).

**Tech Stack:** Next.js 14.2 App Router (client page under the `(app)` route group), TypeScript, static `public/manifest.webmanifest`, existing `public/sw.js`, Vitest + jsdom + @testing-library/react.

## Global Constraints

- **Reuse `/api/entries` unchanged** (Piece 1). The handler calls the existing `postEntry({ rawInput })` from `@/lib/api`; do NOT add a new endpoint or touch the write path. On Android the installed PWA carries the session cookie, so **no import token is used** here.
- **GET share target, not POST.** `public/sw.js` returns early for non-GET requests (`if (request.method !== "GET") return;`), so the share target MUST use `method: "GET"` with url-encoded params. Do NOT change the service worker.
- **Keep the UI simple** (owner-stated, binding): the handler is a minimal landing that shows "Logging…", then "✓ Logged {game}" or a clear error with a fallback link to the paste page. No new nav, no extra chrome.
- **Deploy is HELD** to ship together with Piece 1 (branch `feat/auto-import`), via the standard gated process (backup → migrate `users.import_token_hash` [Piece 1] → merge). Nothing to prod without the owner's explicit go-ahead. Do NOT run anything under `scripts/`.
- The guided "Install app" setup UX is **Piece 3** — out of scope here. Piece 2 makes the mechanism work for anyone who installs the PWA (Android offers "Add to Home screen" automatically for an installable PWA).

---

## Pre-flight #0 — per-game mobile share payload (owner on-device check)

The handler forwards the share sheet's **text** field. It works for any game whose mobile **Share** emits the same parseable text we already parse from pasted results. All 14 parser-backed games have a working text parser today (that's what the paste flow consumes), so the *expected* payload is text for all of them. What can't be verified from code is whether each game's mobile Share button emits that text vs. a bare link or an image.

**Checklist — verify on a real phone (owner), one share per game, that "Log to Bragboard" logs correctly:**

| Game | Expected share payload | Verify on device |
|---|---|---|
| Wordle | text (grid + `n/6`) | ☐ |
| Connections | text (colored-square grid) | ☐ |
| Strands | text (emoji + theme) | ☐ |
| Pinpoint | text (guesses) | ☐ |
| Minute Cryptic | text (hints / under-par) | ☐ |
| Pips (easy/med/hard) | text (time + difficulty) | ☐ |
| Queens | text (time) | ☐ |
| Tango | text (time) | ☐ |
| Mini Sudoku | text (time) | ☐ |
| India Mini | text (time) | ☐ |
| Zip | text (time + backtracks) | ☐ |
| Crossclimb | text (time) | ☐ |
| Patches | text (time + hints) | ☐ |
| Wend | text (time) | ☐ |

- **NYT Mini** stays manual (no parser) — not import-eligible.
- Any game that turns out to share a **link or image** (no parseable text) will surface the handler's "Couldn't read that result" message and stays manual until addressed. Record any such game here after the on-device pass.

This is documentation + a manual QA gate, not a code task. It does not block building the mechanism (the handler is payload-agnostic).

---

## File Structure

- **Modify** `public/manifest.webmanifest` — add the `share_target` member (Task 1).
- **Create** `public/manifest.webmanifest` test → `src/app/manifest.webmanifest.test.ts` (Task 1).
- **Create** `src/app/(app)/share-target/page.tsx` — the client handler (Task 2).
- **Create** `src/app/(app)/share-target/page.module.css` — minimal styling via existing tokens (Task 2).
- **Create** `src/app/(app)/share-target/shareTarget.test.tsx` — jsdom tests (Task 2).

---

## Task 1: `share_target` manifest member

**Files:**
- Modify: `public/manifest.webmanifest`
- Test: `src/app/manifest.webmanifest.test.ts`

**Interfaces:**
- Produces: the installed PWA advertises a GET share target at `/share-target` whose shared text arrives as the `text` query param. Consumed by Task 2's handler.

- [ ] **Step 1: Write the failing test**

Create `src/app/manifest.webmanifest.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("manifest share_target", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));

  it("declares a GET share target at /share-target", () => {
    expect(manifest.share_target).toBeDefined();
    expect(manifest.share_target.action).toBe("/share-target");
    expect(String(manifest.share_target.method).toUpperCase()).toBe("GET");
  });

  it("maps the shared text to the `text` query param", () => {
    expect(manifest.share_target.params.text).toBe("text");
  });

  it("keeps the existing app identity", () => {
    expect(manifest.name).toBe("Bragboard");
    expect(manifest.start_url).toBe("/");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/manifest.webmanifest.test.ts`
Expected: FAIL — `manifest.share_target` is undefined.

- [ ] **Step 3: Add the `share_target` member**

In `public/manifest.webmanifest`, add this top-level key (e.g. after `"description"`; valid JSON — mind the commas):
```json
  "share_target": {
    "action": "/share-target",
    "method": "GET",
    "enctype": "application/x-www-form-urlencoded",
    "params": { "title": "title", "text": "text", "url": "url" }
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/manifest.webmanifest.test.ts`
Expected: PASS (3 tests). Also confirm the file is still valid JSON:
`node -e "JSON.parse(require('fs').readFileSync('public/manifest.webmanifest','utf8')); console.log('valid json')"`

- [ ] **Step 5: Commit**

```bash
git add public/manifest.webmanifest src/app/manifest.webmanifest.test.ts
git commit -m "feat(pwa): add GET share_target to the manifest (Android share capture)"
```

---

## Task 2: `/share-target` handler page

**Files:**
- Create: `src/app/(app)/share-target/page.tsx`
- Create: `src/app/(app)/share-target/page.module.css`
- Test: `src/app/(app)/share-target/shareTarget.test.tsx`

**Interfaces:**
- Consumes: `postEntry(body: EntryInput): Promise<ApiResult<{ ok: true; parsed: { gameId: string; value: number } }>>` from `@/lib/api`; `useSearchParams` from `next/navigation`.
- Produces: the user-facing landing that logs a shared result. No exports consumed elsewhere.

- [ ] **Step 1: Write the failing test**

Create `src/app/(app)/share-target/shareTarget.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const postEntryMock = vi.fn();
const paramsMock = { get: vi.fn() };
vi.mock("@/lib/api", () => ({ postEntry: postEntryMock }));
vi.mock("next/navigation", () => ({ useSearchParams: () => paramsMock }));

const { default: ShareTarget } = await import("./page");

beforeEach(() => {
  vi.clearAllMocks();
  paramsMock.get.mockReturnValue(null);
});

describe("/share-target", () => {
  it("posts the shared text to /api/entries and shows the logged game", async () => {
    paramsMock.get.mockImplementation((k: string) => (k === "text" ? "Wordle 999 4/6" : null));
    postEntryMock.mockResolvedValue({ ok: true, data: { ok: true, parsed: { gameId: "wordle", value: 4 } } });
    render(<ShareTarget />);
    await waitFor(() => expect(postEntryMock).toHaveBeenCalledWith({ rawInput: "Wordle 999 4/6" }));
    expect(await screen.findByText(/logged/i)).toBeTruthy();
    expect(screen.getByText(/wordle/i)).toBeTruthy();
  });

  it("shows a clear error (with a paste fallback link) when the result can't be read", async () => {
    paramsMock.get.mockImplementation((k: string) => (k === "text" ? "gibberish" : null));
    postEntryMock.mockResolvedValue({ ok: false, error: "Couldn't read that result", status: 422 });
    render(<ShareTarget />);
    expect(await screen.findByText(/couldn't read that result/i)).toBeTruthy();
    expect(screen.getByRole("link")).toBeTruthy(); // fallback to the paste page
  });

  it("shows an empty state and does NOT post when there's no shared text", async () => {
    paramsMock.get.mockReturnValue(null);
    render(<ShareTarget />);
    expect(await screen.findByText(/nothing to import/i)).toBeTruthy();
    expect(postEntryMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/(app)/share-target/shareTarget.test.tsx`
Expected: FAIL — cannot resolve `./page`.

- [ ] **Step 3: Implement the handler page**

Create `src/app/(app)/share-target/page.tsx`. NOTE: `useSearchParams` must sit inside a `<Suspense>` boundary or `npm run build` fails — the default export provides it.
```tsx
"use client";
import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { postEntry } from "@/lib/api";
import styles from "./page.module.css";

type State =
  | { status: "logging" }
  | { status: "success"; game: string }
  | { status: "error"; message: string }
  | { status: "empty" };

function ShareTargetInner(): JSX.Element {
  const params = useSearchParams();
  const text = (params.get("text") ?? params.get("url") ?? "").trim();
  const [state, setState] = useState<State>(text ? { status: "logging" } : { status: "empty" });

  useEffect(() => {
    if (!text) return;
    let live = true;
    postEntry({ rawInput: text }).then((res) => {
      if (!live) return;
      if (res.ok) setState({ status: "success", game: res.data.parsed.gameId });
      else setState({ status: "error", message: res.error });
    });
    return () => {
      live = false;
    };
  }, [text]);

  return (
    <div className={styles.wrap}>
      {state.status === "logging" && <p className={styles.msg}>Logging your result…</p>}
      {state.status === "success" && (
        <>
          <p className={styles.ok}>✓ Logged {state.game}</p>
          <Link className={styles.link} href="/board">See the board</Link>
        </>
      )}
      {state.status === "error" && (
        <>
          <p className={styles.err}>{state.message}</p>
          <Link className={styles.link} href="/log">Paste it instead</Link>
        </>
      )}
      {state.status === "empty" && (
        <>
          <p className={styles.msg}>Nothing to import — share a result from a game.</p>
          <Link className={styles.link} href="/log">Log one manually</Link>
        </>
      )}
    </div>
  );
}

export default function ShareTarget(): JSX.Element {
  return (
    <Suspense fallback={<div className={styles.wrap}><p className={styles.msg}>Logging your result…</p></div>}>
      <ShareTargetInner />
    </Suspense>
  );
}
```

- [ ] **Step 4: Add minimal styling**

Create `src/app/(app)/share-target/page.module.css` (tokens only):
```css
.wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-4);
  text-align: center;
}
.msg { color: var(--muted); font-family: var(--font-ui); }
.ok { color: var(--accent); font-family: var(--font-display); font-size: 20px; }
.err { color: var(--danger); font-family: var(--font-ui); }
.link { color: var(--accent); font-family: var(--font-ui); font-weight: 600; }
```
> If any token above is absent in `src/design/tokens.css`, substitute the nearest existing token (e.g. `--danger-weak`/`--ink`) — check the file; do NOT invent new colors.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/(app)/share-target/shareTarget.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck, full suite, build, commit**

Run: `npx tsc --noEmit` (0 errors), `npx vitest run` (all pass), `npm run build` (succeeds — verifies the Suspense boundary satisfies `useSearchParams`).
```bash
git add "src/app/(app)/share-target/"
git commit -m "feat(pwa): /share-target handler posts shared text to /api/entries"
```

---

## Deploy (held — ships with Piece 1, owner go-ahead required)

Do NOT deploy Piece 2 alone. It rides the Piece 1 deploy on `feat/auto-import`:
backup (tag `main` + Neon PITR) → migrate `users.import_token_hash` (Piece 1's additive column) → merge → prod auto-deploys. Piece 2 itself needs no migration. Nothing to prod without explicit go-ahead.

## Out of scope (this plan)

- **iOS Shortcut + guided "Set up auto-log" settings UX** → Piece 3.
- **The per-game on-device share-payload verification** → the owner runs the Pre-flight #0 checklist above (manual QA).
- Live board updates (roadmap B); native app (future).

## Self-Review

- **Spec coverage (Piece 2):** GET `share_target` (SW-compatible) ✓ (Task 1); thin handler posting `{rawInput}` to `/api/entries` via session ✓ (Task 2); reuse of `/api/entries` unchanged ✓ (uses existing `postEntry`); simple UI with paste fallback ✓ (Task 2); pre-flight payload enumeration ✓ (documented checklist); deploy held with Piece 1 ✓.
- **Placeholder scan:** none — manifest member, handler, styles, and tests are all concrete; the one conditional ("if a token is absent, substitute") names the file to check and forbids inventing colors.
- **Type consistency:** handler consumes `postEntry`'s real return shape (`res.data.parsed.gameId`) as defined in `src/lib/api.ts`; `useSearchParams().get` usage matches `next/navigation`; test mocks mirror those signatures.
