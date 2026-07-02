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
