# Appendix A — iOS Shortcut build recipe (owner, one-time; NOT code)

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
