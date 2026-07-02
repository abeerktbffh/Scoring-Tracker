# Dev Foundation / AI-native SDLC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an objective safety net — CI that blocks red code from reaching production, linting, Sentry error + parser-drift monitoring, dependency hygiene, branch protection, and a codified workflow doc — so all future work is faster and safer.

**Architecture:** Config/process work on top of the existing Next.js 14.2.x app. A GitHub Actions `verify` job runs typecheck + lint + the 120 Vitest tests + `next build` on every PR/push (no secrets — the DB client is lazy and tests self-provide dummy env). Sentry is added as a no-op-without-DSN error reporter. Branch protection + the Sentry project/DSN are the two human-only setup steps.

**Tech Stack:** GitHub Actions, ESLint (`eslint-config-next`), `@sentry/nextjs`, Dependabot. No product code changes except one Sentry line in the entries route.

## Global Constraints

- **Node 20** (`.nvmrc`); CI uses `node-version-file: .nvmrc`.
- **CI must need no secrets:** typecheck/lint/test/build all run without env vars. `next build` must succeed with **no** `DATABASE_URL` and **no** Sentry DSN set.
- **Do not resolve the Next.js high/critical advisory here** — it needs a breaking major upgrade and is a tracked roadmap follow-up (owner decision, 2026-07-02). `npm audit fix` for safe fixes only; never `--force`.
- **Free-tier only.** No new paid services.
- Everything ships on branch `feat/dev-foundation` → preview → PR → merge. The CI going **green on this plan's own PR** is the acceptance proof.
- **Match existing style:** 2-space indent, TypeScript strict, small focused files.

---

### Task 1: Lint + typecheck scripts (foundation for CI)

**Files:**
- Modify: `package.json` (scripts + devDependencies)
- Create: `.eslintrc.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run typecheck` (`tsc --noEmit`) and `npm run lint` (`next lint`), both passing. CI (Task 2) runs these.

- [ ] **Step 1: Add scripts to `package.json`**

In the `"scripts"` block add:
```json
    "typecheck": "tsc --noEmit",
    "lint": "next lint"
```

- [ ] **Step 2: Add ESLint devDependencies**

In `"devDependencies"` add (versions matching Next 14.2.x):
```json
    "eslint": "^8.57.0",
    "eslint-config-next": "14.2.35"
```

- [ ] **Step 3: Create `.eslintrc.json`**

```json
{
  "extends": "next/core-web-vitals"
}
```

- [ ] **Step 4: Install and run**

Run: `npm install`
Then: `npm run typecheck` — Expected: no output, exit 0.
Then: `npm run lint` — Expected: `next lint` runs non-interactively.

- [ ] **Step 5: Fix any lint errors until clean**

Address whatever `npm run lint` reports so it exits 0. Likely candidates in this codebase and their fixes:
- **Unescaped apostrophes in JSX** (`react/no-unescaped-entities`) — already use `&apos;` in `tracker.tsx`; fix any stragglers the same way.
- **Unused variables/imports** — remove them.
- **`@next/next` rules** — follow the rule's suggested fix.
Do NOT weaken rules to pass; fix the code. Re-run `npm run lint` until exit 0.

- [ ] **Step 6: Run the full suite (no regressions)**

Run: `npm test` — Expected: 120 passing.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .eslintrc.json src/
git commit -m "chore: add typecheck + eslint (next/core-web-vitals)"
```

---

### Task 2: CI pipeline (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` (Task 1 + existing).
- Produces: a `verify` status check that runs on every PR and push to `main`. Referenced by branch protection (Task 6).

- [ ] **Step 1: Create the workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: ".nvmrc"
          cache: "npm"
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Verify the CI commands pass locally (proxy for CI)**

Run: `npm ci && npm run typecheck && npm run lint && npm test && npm run build`
Expected: all succeed, exit 0. (This is exactly what CI will run; the real green check appears on the PR in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run typecheck, lint, tests, and build on every PR"
```

---

### Task 3: Dependabot + safe audit fixes

**Files:**
- Create: `.github/dependabot.yml`
- Modify: `package.json` / `package-lock.json` (safe audit fixes only)

**Interfaces:**
- Consumes: nothing.
- Produces: weekly dependency-update PRs; safely-fixable advisories resolved.

- [ ] **Step 1: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

- [ ] **Step 2: Apply safe audit fixes only**

Run: `npm audit fix` (NOT `--force`).
Then verify nothing broke: `npm test` (120 pass) and `npm run build` (succeeds).
If `npm audit fix` changes nothing (because the remaining advisory needs `--force`/a major upgrade), that is expected — **leave the Next.js major advisory unfixed** (tracked roadmap follow-up). Do not run `--force`.

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml package.json package-lock.json
git commit -m "chore: add Dependabot and apply safe npm audit fixes"
```

---

### Task 4: Sentry error monitoring + parser-drift alert

**Files:**
- Modify: `package.json` (dependency), `next.config.mjs`
- Create: `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`
- Modify: `src/app/api/entries/route.ts` (drift alert)
- Modify: `.env.example` (document the DSN vars)

> **Reviewer-corrected (2026-07-02):** current `@sentry/nextjs` (v10.x) uses
> `instrumentation-client.ts` for the browser (NOT the old `sentry.client.config.ts`),
> and Next.js **14.2.x requires `experimental: { instrumentationHook: true }`** for the
> server `instrumentation.ts` to register. Both are applied below, and the SDK is
> pinned to avoid version drift. Both failure modes are *silent* (monitoring simply
> doesn't turn on), so acceptance is a **real test event reaching Sentry** (Task 6 Step 4),
> not just a passing build.

**Interfaces:**
- Consumes: nothing.
- Produces: runtime error capture (no-op when DSN unset) and a `[parse-failure]` alert to Sentry. No new exported functions.

- [ ] **Step 1: Install the SDK (pinned to avoid version drift)**

Run: `npm install @sentry/nextjs@^10`
(Pinning the major keeps the file-name/config conventions below stable. If a newer major
is installed, re-verify its client-instrumentation filename before proceeding.)

- [ ] **Step 2: Create the Sentry init configs (errors only, no tracing)**

`instrumentation-client.ts` *(browser errors — current v10 convention; replaces the old `sentry.client.config.ts`)*:
```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});
```

`sentry.server.config.ts`:
```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0,
});
```

`sentry.edge.config.ts`:
```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0,
});
```
(A missing/undefined DSN makes `Sentry.init` a no-op — required so CI/local builds run without secrets.)

- [ ] **Step 3: Register server/edge init via `instrumentation.ts`**

`instrumentation.ts`:
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
```

- [ ] **Step 4: Wrap `next.config.mjs` with `withSentryConfig` (no source-map upload)**

`next.config.mjs`:
```js
import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required on Next 14.2.x so `instrumentation.ts` (server/edge Sentry init) registers.
  // (Stabilized in Next 15; still experimental in 14.2.)
  experimental: { instrumentationHook: true },
};

// No SENTRY_AUTH_TOKEN → source-map upload is skipped (build still succeeds).
export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
});
```

- [ ] **Step 5: Add the parser-drift alert to the entries route**

In `src/app/api/entries/route.ts`, add at the top with the other imports:
```ts
import * as Sentry from "@sentry/nextjs";
```
Find the existing parse-failure branch:
```ts
    if (typeof body.rawInput === "string" && resolved.status === 422) {
      // Surface parser drift: a share text we failed to recognize.
      console.warn("[parse-failure]", body.rawInput.slice(0, 120));
    }
```
Add a Sentry line inside it, after the `console.warn`:
```ts
      Sentry.captureMessage(
        "[parse-failure] " + (body.rawInput as string).slice(0, 120),
        "warning",
      );
```

- [ ] **Step 6: Document the env vars in `.env.example`**

Append:
```
# Optional — Sentry error monitoring (unset = disabled)
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

- [ ] **Step 7: Verify build succeeds with NO DSN set (secret-free CI preserved)**

Run: `rm -rf .next && mv .env.local .env.local.bak 2>/dev/null; npm run build; STATUS=$?; mv .env.local.bak .env.local 2>/dev/null; echo "exit: $STATUS"`
Expected: exit 0 (Sentry no-ops; source-map upload skipped with a warning, not an error).

- [ ] **Step 8: Run typecheck, lint, tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass (120 tests).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json next.config.mjs instrumentation-client.ts sentry.server.config.ts sentry.edge.config.ts instrumentation.ts src/app/api/entries/route.ts .env.example
git commit -m "feat: Sentry error monitoring + parser-drift alert (no-op without DSN)"
```

---

### Task 5: `AGENTS.md` — codified workflow

**Files:**
- Create: `AGENTS.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the written process of record.

- [ ] **Step 1: Create `AGENTS.md`**

```markdown
# Working on Scoring Tracker

## The loop
Every change: **brainstorm → spec → plan → subagent-driven TDD → preview → PR → merge.**
- Specs live in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`.
- Work on a branch off `main`; never commit to `main` directly (it auto-deploys to production).
- Push the branch → Vercel builds an isolated **preview** (its own Neon `preview` branch DB) → verify there → open a PR → merge only when CI is green and the review gate passes.

## Independent review gate (required)
At each gate — **spec, plan, and each PR's code** — a **fresh reviewer agent** (separate
context from the builder) reviews the work and produces:
1. a **plain-language report for the owner** (non-technical): what it is, correctness/safety,
   risks in business terms, and a ✅ approve / ⚠️ hold recommendation; and
2. **technical findings on the PR** for the record.
The owner approves on the plain-language verdict. Only ✅ (or resolved ⚠️) proceeds.

## Database safety (hard rule)
- **No destructive DB operation without the owner's explicit, in-the-moment go-ahead.**
- Cleanup deletes only the exact records the owner names; preview a dry-run first.
- Neon point-in-time restore is the safety net; production and preview use separate Neon branches.

## Conventions that keep this AI-friendly
- Small, focused files with one clear responsibility.
- Tests are the objective gate; parsers are covered by **real-sample fixtures** (the "eval").
- The DB client is **lazy** so `next build` needs no secrets — keep it that way.
- CI (`.github/workflows/ci.yml`) runs typecheck + lint + tests + build on every PR.

## Escape hatch
If branch protection ever wrongly blocks a legitimate merge, a repo admin can temporarily
disable the `main` protection rule, merge, and re-enable it.

## Environments
- **Production:** `main` → Vercel → Neon main branch. Env: `DATABASE_URL` (pooler), `AUTH_SECRET`, Sentry DSNs.
- **Preview:** any branch → Vercel preview → Neon `preview` branch. Same var names, preview-scoped values.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add AGENTS.md (workflow, review gate, DB-safety, conventions)"
```

---

### Task 6: Human setup + final verification

**Files:** none (owner-performed config + acceptance).

This task is performed by the owner (guided) and confirmed by the controller. It is the acceptance gate for the whole workstream.

- [ ] **Step 1: Open the PR**

Push `feat/dev-foundation` and open a pull request into `main`. Confirm the **`verify`** CI check appears and runs.

- [ ] **Step 2: Confirm CI is green**

The `verify` check must pass (typecheck, lint, tests, build). If red, read the failing step, fix on the branch, push, re-check. **This green check is the plan's primary acceptance proof.**

- [ ] **Step 3: Owner — create Sentry project + set DSN**

Owner: create a free Sentry project (Next.js). Copy the DSN. In Vercel → Settings → Environment Variables, add `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` (same DSN value) for **Production** and **Preview**. Redeploy.

- [ ] **Step 4: Verify monitoring works**

On the preview (or prod after redeploy): submit an unrecognized paste (e.g. `random text`) → confirm a `[parse-failure]` event appears in Sentry. (Optional: trigger a one-off test error, confirm it lands, then remove it.)

- [ ] **Step 5: Owner — enable branch protection**

Owner: GitHub → repo → Settings → Branches → add rule for `main`: **Require a pull request before merging** + **Require status checks to pass** → select **`verify`**. Save. (Escape hatch documented in `AGENTS.md` if it ever wrongly blocks.)

- [ ] **Step 6: Merge**

Once CI is green, the independent review gate returns ✅, and branch protection is on, merge the PR. Confirm production redeploys and stays healthy (homepage 200, `friends123` auth works).

---

## Self-Review

**Spec coverage (against the Dev Foundation spec):**
- §1 CI pipeline → Tasks 1 (scripts/lint) + 2 (workflow). ✅
- §2 ESLint → Task 1. ✅
- §3 Sentry → Task 4. ✅
- §4 parser-drift alerting → Task 4 Step 5. ✅
- §5 Dependabot + safe audit; defer Next.js major → Task 3 (explicit no-`--force`). ✅
- §6 branch protection (owner) → Task 6 Step 5. ✅
- §7 AGENTS.md (incl. escape hatch) → Task 5. ✅
- §8 independent review gate → codified in Task 5's AGENTS.md; enacted by the execution's review step + Task 6 Step 6. ✅
- Verification (CI green on PR, Sentry event, drift alert, build succeeds DSN-unset) → Tasks 2, 4, 6. ✅
- Deferred (Next.js upgrade, uptime, source-maps, tracing) → not built; tracked in roadmap. ✅

**Placeholder scan:** No TBD/TODO. Task 1 Step 5 ("fix what lint reports") is discovery-based by nature but names the likely rules + the exact fix approach and the exit-0 acceptance — not a vague placeholder.

**Type/consistency:** New scripts `typecheck`/`lint` referenced consistently in Tasks 1, 2, 4, 6. Sentry env var names (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`) consistent across Tasks 4 and 6 and `.env.example`. The entries-route edit targets the exact existing parse-failure branch (verified present at `src/app/api/entries/route.ts`). `withSentryConfig` options kept minimal so the build stays secret-free.

**Independent plan-review incorporated (2026-07-02):** the reviewer flagged three Task-4 defects, now fixed inline — (1) client init file renamed `sentry.client.config.ts` → `instrumentation-client.ts` (v10 convention); (2) `experimental: { instrumentationHook: true }` added to `next.config.mjs` so the server `instrumentation.ts` registers on Next 14.2.x; (3) `@sentry/nextjs` pinned to `^10`. Because both Sentry failure modes are *silent* (not build-breaking), acceptance for the Sentry piece is a **real `[parse-failure]` / test event reaching Sentry** in Task 6 Step 4, not merely a green build.
