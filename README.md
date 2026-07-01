# Scoring Tracker

A friends' daily-puzzle scoreboard. Paste your Wordle / Connections / Pips / LinkedIn-game
share text (or enter any game by hand), and the group competes on a wins-based leaderboard
with per-game boards and streaks.

**Stack:** Next.js (App Router, TypeScript) · Neon Postgres (`@neondatabase/serverless`) · Vitest.

## Local development

```bash
npm install
# .env.local:
#   DATABASE_URL=<your Neon connection string>
#   AUTH_SECRET=<32+ random bytes, e.g. `openssl rand -hex 32`>
npm run db:migrate                       # create tables
node scripts/seed.mjs                     # seed the game catalog
node scripts/set-passphrase.mjs <pass>    # group passphrase
node scripts/set-admin-passphrase.mjs <pass>   # admin passphrase (add game / rename player)
npm run dev                               # http://localhost:3000
npm test                                  # unit tests
```

## Deploy (Vercel)

1. Push this repo to GitHub and import it in Vercel (Next.js is auto-detected).
2. Set **Environment Variables** in the Vercel project (Production):
   - `DATABASE_URL` — the Neon **pooled** connection string (host contains `-pooler`).
   - `AUTH_SECRET` — 32+ random bytes.
3. Deploy. The app uses the same Neon database, so run the `db:migrate` / seed / passphrase
   scripts once against that database (locally, with the same `DATABASE_URL`) if not already done.

## Architecture

- `src/parsers/` — one pure module per game (`detect`/`parse`) + a registry. Adding an
  auto-parsed game is a new module + a registry line; manual-only games need just a DB row.
- `src/scoring/` — pure win / leaderboard / streak functions.
- `src/app/api/` — Node-runtime routes: auth, entries (append-only), leaderboard, per-game
  board, admin (passphrase-gated). All SQL parameterized; auth enforced server-side.
- `src/app/tracker.tsx` — the single-page UI.
