# Bug automation — one-time setup

This connects the daily bug automation to the **Bragboard Tasks Tracker** Google Sheet
via a Google service account (no browser needed, runs unattended).

1. **Google Cloud Console** (https://console.cloud.google.com):
   a. Create or select a project (e.g. "Bragboard Sheets").
   b. **APIs & Services → Library** → search "Google Sheets API" → **Enable**.
   c. **APIs & Services → Credentials → Create credentials → Service account** → name it → Done.
   d. Open the service account → **Keys** tab → **Add key → Create new key → JSON** → download.
2. Save the downloaded JSON to the repo root as **`.gsheets-key.json`** (already git-ignored — never committed).
3. Open the JSON and copy the `"client_email"` value (looks like `name@project.iam.gserviceaccount.com`).
4. In the sheet → **Share** → paste that email → role **Editor** → Send.
   (No real email is delivered; this just grants the robot account access. Editor is set now so Phase 2's
   status write-back works later; Phase 1 only reads.)
5. Add this line to `.env.local`:
   ```
   GSHEETS_KEY_FILE=./.gsheets-key.json
   ```
6. **Verify (read-only):**
   ```
   set -a && . ./.env.local && set +a && npx tsx scripts/bug-automation/run-triage.mjs
   ```
   Expected: a triage summary listing the sheet's items, split into "Auto-build candidates" and
   "Needs you". It writes **nothing** to the sheet.
