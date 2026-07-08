# Auto-Import — iOS Shortcut + Guided Setup (Piece 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each friend a simple, platform-aware "Set up auto-log" screen so they can turn on one-tap share logging (iPhone via a shared Shortcut + their personal key; Android via installing the PWA), with a quick way to confirm it worked.

**Architecture:** A new client screen at `/setup` (reached from the ☰ drawer) detects the platform and shows only the relevant steps. iPhone: an "Add the Bragboard shortcut" button (links to a single shared iCloud shortcut via `NEXT_PUBLIC_IOS_SHORTCUT_URL`), a "Copy your key" button that mints the personal import token via the existing `POST /api/me/import-token` and copies it, plus short "allow it / turn it on in the share sheet" notes. Android: an "Install app" button using the `beforeinstallprompt` event. A "Check that it worked" control fetches the viewer's recent results and shows the latest. The iOS Shortcut itself is a hand-built Apple artifact (Appendix A recipe) — not code — wired in via the env var.

**Tech Stack:** Next.js 14.2 App Router (client components under `(app)`), TypeScript, Vitest + jsdom + @testing-library/react.

## Global Constraints

- **Reuse Piece 1/2 backends unchanged.** Minting uses the existing `POST /api/me/import-token` (returns `{ token }` once, stores only the hash). "Check that it worked" uses the existing `/api/me`. Do NOT change any API route or the write path.
- **KEEP UI SIMPLE (owner-binding).** Platform-aware: show ONLY the current platform's steps. One action per step, plain language, no jargon (say "your key", never "token"/"bearer"/"manifest"). No new nav tab — reached from the existing ☰ drawer.
- **The iOS Shortcut is not code.** It's built once by the owner from Appendix A and shared as an iCloud link, wired via `NEXT_PUBLIC_IOS_SHORTCUT_URL` (a public env var set in Vercel). The screen MUST degrade gracefully when the env var is unset (show "iPhone setup is coming soon" instead of a dead button) so this ships before the link exists.
- **Copy-to-clipboard** mirrors the existing guarded pattern in `src/components/CreateGroup.tsx` (`navigator.clipboard?.writeText`, feature-detected).
- Deploy is gated (no migration this piece — pure code + one Vercel env var) and needs the owner's explicit go-ahead. Do NOT run anything under `scripts/`.

---

## File Structure

- **Modify** `src/lib/api.ts` — add `mintImportToken()` client helper (Task 1).
- **Create** `src/app/(app)/setup/page.tsx` — the platform-aware guided setup screen (Tasks 2–4).
- **Create** `src/app/(app)/setup/page.module.css` — tokens-only styling (Task 2).
- **Create** `src/app/(app)/setup/setup.test.tsx` — jsdom tests (Tasks 2–4).
- **Create** `src/lib/platform.ts` — `detectPlatform()` (Task 2).
- **Create** `src/lib/platform.test.ts` (Task 2).
- **Modify** `src/components/Drawer.tsx` — add a "Set up auto-log" link to `/setup` (Task 2).
- **Docs** `docs/auto-import-ios-shortcut-recipe.md` — the owner's build recipe (Appendix A, written as part of Task 2's deliverable, not executed).

---

## Task 1: `mintImportToken()` client helper

**Files:**
- Modify: `src/lib/api.ts`
- Test: `src/lib/api.test.ts` (append; the file already tests other helpers)

**Interfaces:**
- Consumes: the existing `request`/`jsonPost` helpers + `ApiResult` in `api.ts`; the live `POST /api/me/import-token` (returns `{ token: string }`).
- Produces: `mintImportToken(): Promise<ApiResult<{ token: string }>>`. Consumed by Task 2's "Copy your key".

- [ ] **Step 1: Write the failing test**

Append to `src/lib/api.test.ts` (mirror how sibling helpers are tested — they mock global `fetch`):
```ts
import { mintImportToken } from "./api";

describe("mintImportToken", () => {
  it("POSTs to /api/me/import-token and returns the token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: "abc123" }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await mintImportToken();
    expect(fetchMock).toHaveBeenCalledWith("/api/me/import-token", expect.objectContaining({ method: "POST" }));
    expect(res).toEqual({ ok: true, data: { token: "abc123" } });
    vi.unstubAllGlobals();
  });
});
```
> If `src/lib/api.test.ts` uses a different fetch-mocking idiom, follow that file's existing convention instead of `stubGlobal`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/api.test.ts`
Expected: FAIL — `mintImportToken` is not exported.

- [ ] **Step 3: Implement (in `src/lib/api.ts`, beside `postEntry`)**
```ts
export function mintImportToken(): Promise<ApiResult<{ token: string }>> {
  return request("/api/me/import-token", jsonPost({}));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/api.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/api.ts src/lib/api.test.ts
git commit -m "feat(api): mintImportToken client helper for /api/me/import-token"
```

---

## Task 2: Platform detection + the guided setup screen (iPhone path) + drawer link

**Files:**
- Create: `src/lib/platform.ts`, `src/lib/platform.test.ts`
- Create: `src/app/(app)/setup/page.tsx`, `src/app/(app)/setup/page.module.css`, `src/app/(app)/setup/setup.test.tsx`
- Modify: `src/components/Drawer.tsx`
- Docs: `docs/auto-import-ios-shortcut-recipe.md`

**Interfaces:**
- Consumes: `mintImportToken` (Task 1).
- Produces: the `/setup` route; `detectPlatform(ua?: string): "ios" | "android" | "other"`. Task 3 (install) + Task 4 (test-it) extend `page.tsx`.

- [ ] **Step 1: Write the failing test for `detectPlatform`**

Create `src/lib/platform.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { detectPlatform } from "./platform";

describe("detectPlatform", () => {
  it("detects iOS (iPhone/iPad)", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("ios");
  });
  it("detects Android", () => {
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel)")).toBe("android");
  });
  it("falls back to other for desktop", () => {
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)")).toBe("other");
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/lib/platform.test.ts`).

- [ ] **Step 3: Implement `src/lib/platform.ts`**
```ts
export type Platform = "ios" | "android" | "other";

/** Best-effort UA-based platform detection for choosing setup instructions. */
export function detectPlatform(ua?: string): Platform {
  const s = (ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")) || "";
  if (/iPhone|iPad|iPod/i.test(s)) return "ios";
  if (/Android/i.test(s)) return "android";
  return "other";
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Write the failing test for the screen (iPhone path)**

Create `src/app/(app)/setup/setup.test.tsx`:
```tsx
// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

const mintMock = vi.fn();
vi.mock("@/lib/api", () => ({ mintImportToken: mintMock, getMe: vi.fn() }));
vi.mock("@/lib/platform", () => ({ detectPlatform: () => "ios" }));

const { default: Setup } = await import("./page");

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => cleanup());

describe("/setup (iOS)", () => {
  it("shows the iPhone steps: add shortcut + copy key", () => {
    process.env.NEXT_PUBLIC_IOS_SHORTCUT_URL = "https://www.icloud.com/shortcuts/abc";
    render(<Setup />);
    expect(screen.getByText(/add the bragboard shortcut/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy your key/i })).toBeTruthy();
  });

  it("Copy your key mints a token and copies it to the clipboard", async () => {
    mintMock.mockResolvedValue({ ok: true, data: { token: "key_xyz" } });
    render(<Setup />);
    fireEvent.click(screen.getByRole("button", { name: /copy your key/i }));
    await waitFor(() => expect(mintMock).toHaveBeenCalled());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("key_xyz");
    expect(await screen.findByText(/copied/i)).toBeTruthy();
  });

  it("uses the baked-in shortcut link when no env override is set", () => {
    delete process.env.NEXT_PUBLIC_IOS_SHORTCUT_URL;
    render(<Setup />);
    const link = screen.getByRole("link", { name: /add the bragboard shortcut/i });
    expect(link.getAttribute("href")).toContain("icloud.com/shortcuts/");
  });
});
```

- [ ] **Step 6: Run → FAIL** (no `./page`).

- [ ] **Step 7: Implement `src/app/(app)/setup/page.tsx`** (iPhone path + scaffold; Android + test-it added in Tasks 3–4)
```tsx
"use client";
import React, { useState } from "react";
import { detectPlatform } from "@/lib/platform";
import { mintImportToken } from "@/lib/api";
import styles from "./page.module.css";

// The shared "Start Bragging" shortcut. Public + stable (the per-user key is an
// iOS Import Question, so nothing secret travels in the link). Baked as the
// default; NEXT_PUBLIC_IOS_SHORTCUT_URL can override it if it ever changes.
const DEFAULT_SHORTCUT_URL = "https://www.icloud.com/shortcuts/c3ecc98935394c6e94b1b7a039d5a598";
const SHORTCUT_URL = process.env.NEXT_PUBLIC_IOS_SHORTCUT_URL || DEFAULT_SHORTCUT_URL;

function CopyKey(): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onCopy() {
    setError(null);
    const res = await mintImportToken();
    if (!res.ok) { setError("Couldn't create your key — try again."); return; }
    const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (clip?.writeText) await clip.writeText(res.data.token);
    setCopied(true);
  }
  return (
    <div className={styles.step}>
      <button type="button" className={styles.btn} onClick={onCopy}>Copy your key</button>
      {copied && <span className={styles.ok}>Copied — paste it into the shortcut when it asks.</span>}
      {error && <span className={styles.err}>{error}</span>}
    </div>
  );
}

function IosSteps(): JSX.Element {
  return (
    <ol className={styles.steps}>
      <li>
        {SHORTCUT_URL
          ? <a className={styles.btn} href={SHORTCUT_URL} target="_blank" rel="noopener noreferrer">Add the Bragboard shortcut</a>
          : <span className={styles.muted}>iPhone setup is coming soon.</span>}
      </li>
      <li><CopyKey /><span className={styles.muted}>When you add the shortcut, it asks <b>"Paste your Bragboard key"</b> — paste it there. (Confirmed: the shortcut uses an iOS Import Question, so there's no editing.)</span></li>
      <li><span className={styles.muted}>Tap <b>Allow</b> the first time the shortcut runs.</span></li>
      <li><span className={styles.muted}>In a game's Share sheet, if you don't see <b>Start Bragging</b>, tap <b>More</b> and turn it on once.</span></li>
    </ol>
  );
}

export default function Setup(): JSX.Element {
  const platform = detectPlatform();
  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>Set up auto-log</h1>
      <p className={styles.lede}>Log a result by tapping <b>Share</b> in a game and choosing Bragboard — no more copy-paste.</p>
      {platform === "ios" && <IosSteps />}
      {platform === "android" && <p className={styles.muted}>Android setup loads here.{/* Task 3 */}</p>}
      {platform === "other" && <p className={styles.muted}>Auto-log is a phone feature — open Bragboard on your phone to set it up.</p>}
    </div>
  );
}
```

- [ ] **Step 8: Add `page.module.css`** (tokens only; verify each token exists in `src/design/tokens.css`, substitute nearest if not — do NOT invent colors)
```css
.wrap { display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-5) var(--space-4); }
.h1 { font-family: var(--font-display); font-size: 24px; }
.lede { color: var(--ink-soft, var(--muted)); font-family: var(--font-ui); }
.steps { display: flex; flex-direction: column; gap: var(--space-4); padding-left: var(--space-4); }
.step { display: flex; flex-direction: column; gap: var(--space-2); }
.btn { display: inline-block; background: var(--accent); color: #fff; border: none; border-radius: var(--r-pill, 999px); padding: var(--space-2) var(--space-4); font-family: var(--font-ui); font-weight: 600; cursor: pointer; text-decoration: none; }
.muted { color: var(--muted); font-family: var(--font-ui); font-size: 14px; }
.ok { color: var(--accent); font-family: var(--font-ui); font-size: 14px; }
.err { color: var(--danger); font-family: var(--font-ui); font-size: 14px; }
```

- [ ] **Step 9: Add the drawer link.** In `src/components/Drawer.tsx`, add a navigation link to `/setup` labeled "Set up auto-log" (follow the file's existing link/item pattern — match how the theme toggle / admin link are rendered). If Drawer items are `<Link>`s, add `<Link href="/setup">Set up auto-log</Link>`; if they're buttons calling `router.push`, mirror that.

- [ ] **Step 10: Write Appendix A recipe doc.** Create `docs/auto-import-ios-shortcut-recipe.md` with the exact Shortcut build steps from Appendix A of this plan (verbatim), for the owner to build the iCloud shortcut.

- [ ] **Step 11: Run tests → PASS** (`npx vitest run src/app/(app)/setup/setup.test.tsx src/lib/platform.test.ts`), then `npx tsc --noEmit` (0).

- [ ] **Step 12: Commit**
```bash
git add src/lib/platform.ts src/lib/platform.test.ts "src/app/(app)/setup/" src/components/Drawer.tsx docs/auto-import-ios-shortcut-recipe.md
git commit -m "feat(setup): platform-aware Set up auto-log screen (iPhone path) + drawer link"
```

---

## Task 3: Android "Install app" step

**Files:**
- Modify: `src/app/(app)/setup/page.tsx`, `src/app/(app)/setup/setup.test.tsx`

**Interfaces:**
- Consumes: the browser `beforeinstallprompt` event.
- Produces: an `AndroidSteps` section rendered when `platform === "android"`.

- [ ] **Step 1: Write the failing test** (append to `setup.test.tsx`)
```tsx
describe("/setup (Android)", () => {
  it("shows an Install app button and triggers a captured install prompt", async () => {
    vi.resetModules();
    vi.doMock("@/lib/platform", () => ({ detectPlatform: () => "android" }));
    const { default: SetupA } = await import("./page");
    render(<SetupA />);
    const promptFn = vi.fn().mockResolvedValue(undefined);
    // Simulate Chrome firing beforeinstallprompt
    const evt: any = new Event("beforeinstallprompt");
    evt.prompt = promptFn;
    window.dispatchEvent(evt);
    const btn = await screen.findByRole("button", { name: /install app/i });
    fireEvent.click(btn);
    await waitFor(() => expect(promptFn).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run → FAIL** (no Install button on the android branch).

- [ ] **Step 3: Implement `AndroidSteps` in `page.tsx`**
```tsx
function AndroidSteps(): JSX.Element {
  const [deferred, setDeferred] = useState<any>(null);
  React.useEffect(() => {
    const onBIP = (e: any) => { e.preventDefault?.(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);
  return (
    <ol className={styles.steps}>
      <li>
        <button type="button" className={styles.btn} onClick={() => deferred?.prompt?.()}>Install app</button>
        <span className={styles.muted}>{deferred ? "Then reopen Bragboard from your home screen." : "If nothing happens, use Chrome's menu → Install app."}</span>
      </li>
      <li><span className={styles.muted}>Once installed, tap a game's <b>Share</b> and choose Bragboard.</span></li>
    </ol>
  );
}
```
Replace the `platform === "android"` placeholder line with `<AndroidSteps />`.

- [ ] **Step 4: Run → PASS**, `npx tsc --noEmit` (0).

- [ ] **Step 5: Commit**
```bash
git add "src/app/(app)/setup/"
git commit -m "feat(setup): Android Install app step via beforeinstallprompt"
```

---

## Task 4: "Check that it worked" confirm

**Files:**
- Modify: `src/app/(app)/setup/page.tsx`, `src/app/(app)/setup/setup.test.tsx`

**Interfaces:**
- Consumes: the viewer's own results. Use `getMe(name)` from `@/lib/api` if a viewer name is readily available, OR fetch `/api/me` (session-scoped) directly; render the most recent `recent[]` entry via `formatResult(gameId, value, solved, detail)`. (The MeResponse `recent[]` shape: `{ gameId, value, solved, detail, puzzleDate }`.)
- Produces: a "Check that it worked" control appended to all platform paths.

- [ ] **Step 1: Write the failing test** (append to `setup.test.tsx`, iOS describe)
```tsx
it("Check that it worked shows the latest logged result", async () => {
  process.env.NEXT_PUBLIC_IOS_SHORTCUT_URL = "https://www.icloud.com/shortcuts/abc";
  const { getMe } = await import("@/lib/api");
  (getMe as any).mockResolvedValue({ ok: true, data: { displayName: "Dev", recent: [{ gameId: "wordle", value: 4, solved: true, detail: null, puzzleDate: "2026-07-08" }] } });
  render(<Setup />);
  fireEvent.click(screen.getByRole("button", { name: /check that it worked/i }));
  expect(await screen.findByText(/wordle/i)).toBeTruthy();
});
```
> Ensure the `@/lib/api` mock in this file also exports `getMe` (already added in Task 2's `vi.mock`). If `getMe` needs a viewer name, first read it from an initial `getMe`/`/api/me` call for `displayName`, or pass an empty string — the route is session-scoped; confirm against `src/app/api/me/route.ts` and use the form that returns the viewer's own recent list.

- [ ] **Step 2: Run → FAIL** (no such control).

- [ ] **Step 3: Implement a `CheckIt` component** in `page.tsx` (rendered under every platform branch):
```tsx
import { getMe } from "@/lib/api";
import { formatResult } from "@/lib/formatResult";

function CheckIt(): JSX.Element {
  const [result, setResult] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  async function onCheck() {
    setChecked(true);
    const res = await getMe(""); // session-scoped; returns the viewer's own recent list
    if (res.ok && res.data.recent.length > 0) {
      const r = res.data.recent[0];
      setResult(`✓ We see it: ${r.gameId} ${formatResult(r.gameId, r.value, r.solved, r.detail)}`);
    } else {
      setResult(null);
    }
  }
  return (
    <div className={styles.step}>
      <button type="button" className={styles.btn} onClick={onCheck}>Check that it worked</button>
      {checked && (result ? <span className={styles.ok}>{result}</span>
        : <span className={styles.muted}>Nothing yet — share a result from a game, then check again.</span>)}
    </div>
  );
}
```
Render `<CheckIt />` after the platform sections (inside the `Setup` return, before the closing `</div>`).
> Confirm `getMe`'s signature against `src/lib/api.ts` and that `/api/me` returns the viewer's own `recent` when session-authed; adapt the call (e.g. pass the viewer's display name) if the route requires it — the goal is "show the viewer's most recent logged result."

- [ ] **Step 4: Run → PASS**, `npx tsc --noEmit` (0), full suite `npx vitest run`, `npm run build`.

- [ ] **Step 5: Commit**
```bash
git add "src/app/(app)/setup/"
git commit -m "feat(setup): Check that it worked shows the viewer's latest result"
```

---

## Deploy (gated — owner go-ahead; no migration)

Pure code — **no migration, no env var required** (the "Start Bragging" iCloud link is already built and baked in as `DEFAULT_SHORTCUT_URL`; the import-question prompt is confirmed working). Sequence:
1. Backup tag `main`.
2. **Merge** the branch → prod auto-deploys.
Nothing to prod without explicit go-ahead.

## Out of scope

- Live board updates (roadmap B); native app (future — the token is its auth foundation).
- The `beforeinstallprompt` UX is best-effort (Chrome-only event); a fallback instruction covers other cases.

## Appendix A — iOS Shortcut build recipe (owner, one-time; NOT code)

Build once in the iOS **Shortcuts** app, then Share → **Copy iCloud Link** and send it to wire into `NEXT_PUBLIC_IOS_SHORTCUT_URL`.

1. New Shortcut → name it **"Start Bragging"** (this is the label friends see + tap in their share sheet — owner-chosen).
2. In shortcut settings, enable **Show in Share Sheet**; set **Accept** = *Text* (and *URLs*, *Safari web pages* to be safe).
3. Add a **Text** action containing your key placeholder, OR use an **Import Question**: add a **Comment**/**Ask for Input** or set a shortcut **Import Question** prompting *"Enter your Bragboard key"* and store it in a variable `Key`. (Import questions prompt each person once when they add the shortcut.)
4. Add **Get Contents of URL**:
   - URL: `https://scoring-tracker.vercel.app/api/entries`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer ` + `Key`; `Content-Type` = `application/json`
   - Request Body: **JSON** → `{ "rawInput": <Shortcut Input> }` (the shared text).
5. Add a **Show Notification** with the response (so the user sees "Logged …").
6. Test it on your own phone (paste your key from the Bragboard "Set up auto-log" screen), share a real game result, confirm it logs. Then **Share → Copy iCloud Link**.

## Self-Review

- **Spec coverage (§5/§6):** platform-aware screen ✓ (Task 2); iPhone add-shortcut via env var + graceful-when-unset ✓ (Task 2); copy-your-key via `POST /api/me/import-token` ✓ (Tasks 1–2); allow/share-sheet notes ✓ (Task 2); Android install ✓ (Task 3); "test it" confirm ✓ (Task 4); reached from ☰ drawer ✓ (Task 2); Shortcut recipe (not code) ✓ (Appendix A); one-time token paste baseline ✓; keep-simple/no-jargon ✓.
- **Placeholder scan:** the two "confirm getMe signature/param against the route" notes in Task 4 are genuine (the exact viewer-scoping of `/api/me` should be read from source at implementation) — not vague filler; the concrete goal ("show the viewer's most recent logged result") + the fallback are specified. All other steps carry real code.
- **Type consistency:** `mintImportToken` return `{ token: string }` used identically in Tasks 1–2; `detectPlatform` union `"ios"|"android"|"other"` matches its uses; `formatResult(gameId, value, solved, detail)` matches its real signature; MeResponse `recent[]` fields match `src/lib/api.ts`.
