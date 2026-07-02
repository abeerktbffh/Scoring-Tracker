# Scoring Tracker — Product & Engineering Roadmap

**Date:** 2026-07-02
**Status:** Approved (living document)
**Author:** Abeer Bhatia (with Claude)

## Purpose

The core app is live and in daily use (scoring-tracker.vercel.app): 14 auto-parsed
daily-puzzle games + manual entry, a windowed multi-metric leaderboard, per-game
streaks, per-game daily no-peek, admin, and a branch → preview → merge pipeline with
an isolated preview database. This document decomposes "where it goes next" into
independent workstreams, prioritizes them, and defines the first one in enough detail
to plan. **It is not a single implementation spec** — each workstream below gets its
own `spec → plan → subagent-driven build` cycle.

## Ambition & guiding principles

- **North star (near-term):** grow to **multi-group** — private leagues that friends
  of friends can spin up. **Not** a public sign-up product yet; that remains a separate,
  deliberate later decision (would add accounts, moderation, scaling, ops).
- **Principles carried forward:**
  - **Free-tier-first**, revisited when multi-group scale warrants it (Neon/Vercel paid tiers, cost monitoring).
  - **Honor-system → verified hybrid:** cheap guards (PIN, daily lock, append-only) now; auto-import raises trust as groups get less tight-knit.
  - **Configurable games; mobile-first; small, testable units.**
  - **AI-native SDLC as the default way we ship:** spec → plan → subagent-driven TDD → preview → merge, with CI as the objective gate and evals for AI-parsed components.
- **Data model is multi-tenant-ready:** every table already carries `group_id`, so multi-group is mostly UX + auth, not a rewrite.

## Workstreams

### A. Dev foundation / AI-native SDLC — *build first*
- **Goal:** make every later workstream faster and safer; answer "how do we do AI-native SDLC well."
- **Scope:** CI (GitHub Actions: typecheck, lint, Vitest, `next build` on every PR/push); branch protection blocking red merges to `main`; a **parser eval harness** (real-sample corpus enforced in CI + surfaced prod parse-failure logs so format drift is noticed); runtime **error/uptime monitoring** (e.g. Sentry free tier); **Dependabot** + resolve known `npm audit` advisories; a codified `AGENTS.md`/contributing doc capturing the loop and conventions.
- **Depends on:** nothing.
- **Size:** small–medium. **Open questions:** monitoring tool choice; add ESLint (`next lint`) or not; solo-dev branch protection (require PR, or just require CI green).

### B. UX & front-end overhaul
- **Goal:** significantly improve design & experience; establish the design system the rest builds on.
- **Scope:** mobile-first refinement, **PWA** (installable, home-screen, offline shell), clearer entry/leaderboard/per-game flows, richer standings & visuals, empty/locked/error states, accessibility pass.
- **Depends on:** A (nice-to-have: CI to protect the redesign).
- **Size:** medium. **Open questions:** how far the redesign goes (refine vs. rethink); PWA scope; keep the "Arcade Board" identity or evolve it.

### C. Multi-group + identity — *the committed near-term bet*
- **Goal:** let people create/join their own private groups; make identity work across groups.
- **Scope:** group creation & switching; per-group admin; **stronger identity** (magic-link or light accounts — the shared-passphrase + PIN model doesn't scale to many groups); **invite & onboarding** flow; per-group leaderboards/games; migration of the existing single group.
- **Depends on:** A; ideally B (so new screens use the new design system).
- **Size:** large (its own multi-task plan). **Open questions:** identity mechanism (magic-link vs. OAuth vs. accounts); how games/config are scoped per group (shared catalog vs. per-group); abuse posture for less-trusted members.

### D. Offline-game scoreboards (Judgment, Chaotic Yusuf)
- **Goal:** track in-person, session-based card games alongside daily puzzles.
- **Scope:** a **new session/round model** distinct from daily-puzzle entries — live multi-round scoring among people in one sitting, custom per-game rules (Judgment: bids/tricks/trump/round scoring; Chaotic Yusuf: round scoring). The existing `Offline Games/judgment.html` and `scoreboard.html` are the reference implementations. Decide integration depth: embed as first-class "games" vs. a parallel "sessions" feature.
- **Depends on:** A. Independent of B/C — can slot in wherever.
- **Size:** medium. **Open questions:** shared data model with daily puzzles or separate; do offline results feed the same leaderboard or a separate one; real-time/live-updating scorekeeping vs. enter-final-scores.

### E. Auto-import from sources (LinkedIn / NYT / etc.)
- **Goal:** eliminate copy-paste; pull results directly, which also strengthens anti-cheat.
- **Scope:** **feasibility spike first** — these have no public "my score" APIs, so evaluate browser extension / OS share-target / bookmarklet / email-digest parsing rather than scraping (fragile + ToS risk). Then design the viable path.
- **Depends on:** A; benefits from C's identity work.
- **Size:** unknown until the spike; potentially large. **Open questions:** which source first; extension vs. share-target vs. email; per-user opt-in/consent.

### F. Engagement & growth — *ongoing backlog*
- **Goal:** retention and (for multi-group) organic spread.
- **Scope:** daily reminders / weekly recap, streak-freeze, "you're 1 win behind X" nudges, achievements & seasons, and the invite/growth loop that pairs with C.
- **Depends on:** varies; notifications pair with B (PWA push) and C.
- **Size:** many small pieces pulled as we go. **Open questions:** notification channel (PWA push vs. email); which engagement mechanic first.

## Sequence & rationale

**A → B → C**, with **D** sliding in wherever convenient (self-contained) and **E** last (hardest; wants the foundation + auth in place). **F** is a continuous backlog.

Rationale: the foundation (A) makes everything safer before we add complexity; the design system (B) exists before we build multi-group screens (C) on it, avoiding a double redesign; the big multi-tenancy + identity bet (C) comes on a solid, well-tested, well-designed base; the risky auto-import (E) comes last when safety nets and identity exist.

*Accepted tension:* multi-group is wanted "soon," yet B precedes C. If speed-to-multi-group later outweighs redesign cost, B and C can swap — a conscious call to make when we finish A.

## First sub-project — Dev foundation / AI-native SDLC

Delivers:
1. **CI pipeline** (GitHub Actions) on every push/PR: `tsc --noEmit`, lint, the full Vitest suite, and `next build`.
2. **Branch protection** on `main`: no merge unless CI is green (this pairs with the existing rule that `main` auto-deploys to production).
3. **Parser eval harness:** the real-sample fixtures formalized as a CI-enforced eval, plus a way to surface the existing prod `[parse-failure]` logs so NYT/LinkedIn format drift is noticed early.
4. **Runtime monitoring:** error tracking (Sentry free tier or similar) + a simple uptime check — would have caught the prod 500s immediately.
5. **Dependency hygiene:** Dependabot + resolve the known `npm audit` advisories.
6. **Codified workflow:** an `AGENTS.md`/contributing doc capturing spec → plan → subagent-TDD → preview → merge, the DB-safety rule (no destructive ops without explicit go-ahead), and conventions that keep the codebase AI-friendly (small focused files, tests as the gate, evals for parsers).

Its own brainstorm will resolve the open questions (monitoring tool, ESLint, branch-protection strictness) before its spec + plan.

## Success criteria (how we know the roadmap is working)

- Each workstream ships as an independent, preview-verified, mergeable increment — the app stays live throughout.
- **A:** red code cannot reach `main`; a parser format break is caught by CI/monitoring, not by a confused friend.
- **B:** the app is comfortably usable (and installable) on a phone.
- **C:** a friend can create a private group and invite others without you touching the database.
- **D:** a Judgment/Chaotic Yusuf night is scored in-app.
- **E:** at least one game's results import without pasting.

## Process note

This roadmap is a **living document**. Each workstream is brainstormed → spec'd → planned → built on its own branch through the established pipeline. Priorities can be re-ordered between workstreams as real usage and appetite dictate; update this file when they change.
