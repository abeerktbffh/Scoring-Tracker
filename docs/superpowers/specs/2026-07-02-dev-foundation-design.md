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
- Run `npm audit fix` and resolve the known advisories; verify tests + build still pass.
  If a fix requires a breaking major bump, note it and leave that one for a separate PR.

### 6. Branch protection *(user config — my token lacks repo-admin)*
- GitHub → repo → Settings → Branches → add rule for `main`:
  **Require a pull request before merging** + **Require status checks to pass** → select the
  CI **`verify`** check. This is what enforces "no red code to production" (pairs with
  `main` auto-deploying to prod). Exact click-steps provided at execution time.

### 7. `AGENTS.md` — codified workflow
- Document: the loop (spec → plan → subagent-driven TDD → preview → PR → merge); the
  **DB-safety rule** (no destructive database ops without explicit in-the-moment go-ahead;
  cleanup deletes only named players; Neon PITR is the safety net); env/DB layout
  (prod vs. `preview` Neon branch); and AI-friendly conventions (small focused files,
  tests as the objective gate, real-sample evals for parsers, lazy DB client so builds
  stay env-free).

## Code vs. user-config split
- **I build:** CI workflow, ESLint config + fixes, Sentry SDK integration + drift alert,
  `dependabot.yml`, audit fixes, `AGENTS.md`, new npm scripts.
- **You do (guided):** create the Sentry project + set its DSN in Vercel; enable branch
  protection on `main` in GitHub settings.

## Verification
- `npm run typecheck`, `npm run lint`, `npm test` (120), `npm run build` all pass locally.
- The CI workflow runs **green on its own PR** (the definitive proof of the pipeline).
- Sentry receives a test event (temporary throwaway capture, then removed), and a
  deliberately-unparseable paste on preview produces a `[parse-failure]` alert.
- Build still succeeds with the Sentry DSN unset (secret-free CI preserved).

## Out of scope (deferred)
- Sentry source-map upload, performance tracing/session replay.
- Uptime pinging beyond Sentry (can add a simple monitor later).
- Any product feature (belongs to workstreams B–F).
