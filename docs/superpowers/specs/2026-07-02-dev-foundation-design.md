# Dev Foundation / AI-native SDLC — Design Spec

**Date:** 2026-07-02
**Status:** Approved for planning
**Workstream:** A (first) of the [roadmap](2026-07-02-roadmap-design.md)

## Goal

Put an objective safety net under all future work: continuous integration that blocks
red code from reaching production, linting, runtime error/drift monitoring, dependency
hygiene, and a written record of how we build. Small, high-leverage, no new product
surface — the foundation the multi-group / UX / auto-import workstreams build on.

## Global constraints

- **CI needs no secrets:** the DB client is lazy (build is env-free) and tests self-provide
  dummy env via `vitest.setup.ts`, so typecheck/lint/test/build all run in GitHub Actions
  with no configuration.
- **Node 20** (matches `.nvmrc` and local).
- **Free-tier only:** GitHub Actions (free for this repo), Sentry free tier, Dependabot (free).
- Ships on `feat/dev-foundation` → preview → PR → merge (the established pipeline).

## Components

### 1. CI pipeline — `.github/workflows/ci.yml`
- Triggers: `pull_request` (any branch) and `push` to `main`.
- One job **`verify`** on `ubuntu-latest`, Node 20 (`actions/setup-node`, `.nvmrc`):
  `npm ci` → `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`.
- New `package.json` scripts: `"typecheck": "tsc --noEmit"`, `"lint": "next lint"`.
- No env/secrets required.

### 2. ESLint
- Add devDeps `eslint` + `eslint-config-next` (matching Next 14.2.x).
- `.eslintrc.json`: `{ "extends": "next/core-web-vitals" }`.
- Fix any issues it surfaces so `npm run lint` (and CI) starts green.

### 3. Sentry — runtime error monitoring
- Add `@sentry/nextjs`; standard init (client + server configs / `instrumentation.ts`),
  wrapped `next.config.mjs` via `withSentryConfig` with **source-map upload disabled**
  (no `SENTRY_AUTH_TOKEN` needed; error capture still works).
- DSN via env: `NEXT_PUBLIC_SENTRY_DSN` (client) / `SENTRY_DSN` (server).
- **Build must still succeed with the DSN unset** (Sentry no-ops without a DSN) so CI stays secret-free.
- *User config:* create a free Sentry project; set the DSN in Vercel env (Production + Preview).

### 4. Parser-drift alerting
- In `src/app/api/entries/route.ts`, where a paste fails to parse, additionally call
  `Sentry.captureMessage("[parse-failure] " + sample, "warning")` (keep the existing
  `console.warn`). So a changed NYT/LinkedIn share format raises an alert instead of a
  silent 422. (The real-sample fixture tests already act as the parser "eval" in CI.)

### 5. Dependabot + audit
- `.github/dependabot.yml`: npm ecosystem, directory `/`, weekly schedule.
- Run `npm audit fix` for the **safely-fixable** advisories; verify tests + build still pass.
- **Explicitly deferred (owner decision, 2026-07-02):** a **high/critical advisory in the
  current Next.js (14.2.x)** whose only fix is a **breaking major upgrade**. This workstream
  does **not** resolve it; it is tracked as a named near-term follow-up in the roadmap
  ("Tech-debt / security follow-ups"). Acceptable interim because the app holds no sensitive
  data (display names + puzzle scores) and DB credentials are server-side only — but it is a
  conscious "yes, later," not a silent omission.

### 6. Branch protection *(user config — my token lacks repo-admin)*
- GitHub → repo → Settings → Branches → add rule for `main`:
  **Require a pull request before merging** + **Require status checks to pass** → select the
  CI **`verify`** check. This is what enforces "no red code to production" (pairs with
  `main` auto-deploying to prod). Exact click-steps provided at execution time.

### 7. `AGENTS.md` — codified workflow
- Document: the loop (spec → plan → subagent-driven TDD → preview → PR → merge); the
  **independent-review gate** (§8); the **DB-safety rule** (no destructive database ops
  without explicit in-the-moment go-ahead; cleanup deletes only named players; Neon PITR
  is the safety net); env/DB layout (prod vs. `preview` Neon branch); and AI-friendly
  conventions (small focused files, tests as the objective gate, real-sample evals for
  parsers, lazy DB client so builds stay env-free). Include a one-line **escape hatch**:
  if branch protection ever wrongly blocks a legitimate merge, a repo admin can temporarily
  disable the rule, merge, and re-enable it.

### 8. Independent Reviewer role — plain-language governance
- **Why:** the owner is non-technical and steers the work; they must be able to govern it
  without reading code. This is the human-in-the-loop mechanism for AI-driven development.
- **What:** a standing role, **separate from the builder**. At **every gate — the design
  spec, the implementation plan, and each PR's code** — a **fresh reviewer agent**
  (independent context; not the agent that produced the work) reviews it and produces:
  1. a **plain-language report for the owner** — what it is, whether it's correct and safe,
     risks in business terms, and a clear **✅ approve / ⚠️ hold** recommendation, no jargon; and
  2. the **technical findings posted on the PR** (code gate) for the record.
- **The owner approves on the plain-language verdict, not the code.** Only ✅ (or resolved
  ⚠️) proceeds to the next gate.
- This gate is required and codified in `AGENTS.md`. It is process, not a code artifact —
  it applies to this workstream and all future ones.

## Code vs. user-config split
- **I build:** CI workflow, ESLint config + fixes, Sentry SDK integration + drift alert,
  `dependabot.yml`, audit fixes, `AGENTS.md`, new npm scripts.
- **I orchestrate (process, §8):** the independent-review gate — dispatch a fresh reviewer
  agent at each spec/plan/code gate and deliver you the plain-language report + PR record.
- **You do (guided):** create the Sentry project + set its DSN in Vercel; enable branch
  protection on `main` in GitHub settings.

## Verification
- `npm run typecheck`, `npm run lint`, `npm test` (120), `npm run build` all pass locally.
- The CI workflow runs **green on its own PR** (the definitive proof of the pipeline).
- Sentry receives a test event (temporary throwaway capture, then removed), and a
  deliberately-unparseable paste on preview produces a `[parse-failure]` alert.
- Build still succeeds with the Sentry DSN unset (secret-free CI preserved).

## Out of scope (deferred — tracked in the roadmap's "Tech-debt / security follow-ups")
- **Next.js major upgrade** to clear the high/critical advisory (§5) — near-term follow-up.
- **Uptime monitoring** (a "is the site reachable" ping) — revisit as multi-group nears.
- Sentry source-map upload, performance tracing/session replay.
- Any product feature (belongs to workstreams B–F).
