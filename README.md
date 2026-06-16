# Sojourn

> A personal dashboard for international students — never miss an academic deadline or a bill payment, with one-click export to your real calendar.

Sojourn is a fast, private, single-page web app. Add the academic deadlines and recurring bills you'd otherwise lose in your inbox, see them prioritized at a glance, and export everything to Google / Apple / Outlook Calendar with a single click.

Everything stays in your browser. No accounts, no servers, no tracking.

---

## Features

### Core
- **Tasks & Bills** — log academic deadlines (exam / assignment / other) and living-cost bills (rent / utilities / insurance / phone / internet / tuition / subscription / other).
- **Prioritized dashboard** with a color-coded urgency stripe (overdue / due in ≤ 3 days / due this week / later) and clear relative time ("tomorrow", "in 5 days", "3 days overdue").
- **Summary strip** — at-a-glance counts for overdue, due-soon, total items, and the total amount due this month. Multi-currency totals are shown sensibly (primary currency + the rest as subtotals).
- **Monthly calendar view** — see every item on its date, navigate months, tap a day to see its items.
- **One-click `.ics` export** — generates a standards-compliant iCalendar file with `VCALENDAR` / `VEVENT`, correct line folding, `UID`, `DTSTAMP`, and `RRULE:FREQ=MONTHLY` for recurring bills. Imports cleanly into Google Calendar, Apple Calendar, and Outlook.
- **6 languages** — English, 한국어, 日本語, 中文, Tiếng Việt, Монгол. Auto-detected on first run.
- **14 currencies** with native Intl formatting (USD, EUR, GBP, KRW, JPY, CNY, VND, MNT, AUD, CAD, SGD, HKD, TWD, INR).

### Extra features (added beyond the brief)
- **Light / Dark / Auto theme** — auto follows your OS.
- **Done / Paid toggle** — check off completed items; they stay visible but visually muted.
- **JSON backup export & import** — full data portability when switching devices.
- **Quick-add presets** on the empty state for the four most common student bills.
- **Tab-title heartbeat** — when you have items due within 3 days, the browser tab shows a `(N)` badge so you remember even with the tab in the background.
- **Smart recurring projection** — monthly bills are projected forward; the dashboard always shows the next occurrence, and the calendar shows them in every future month.
- **Subtle motion** — soft fades, slide-up modal, hover lifts. Respects `prefers-reduced-motion`.
- **Installable PWA** — works offline, gets its own home-screen icon, launches in standalone mode.
- **Floating glass nav** on desktop, classic bottom tab bar on mobile.

---

## Tech

Pure front-end. No build step, no server, no API keys.

- **HTML / CSS / vanilla JavaScript** — no framework.
- **PWA** — `manifest.json` + service worker with network-first HTML / cache-first assets.
- **localStorage** persistence.
- Built-in `Intl.NumberFormat` / `Intl.DateTimeFormat` for locale-aware money and dates.
- `.ics` generation is hand-rolled (no library) following RFC 5545.

### File layout
```
sojourn/
├── index.html
├── styles.css
├── i18n.js              # all six language dictionaries + currency list
├── app.js               # state, rendering, .ics export, persistence
├── manifest.json        # PWA manifest
├── service-worker.js    # offline caching
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable-512.png
│   └── apple-touch-icon.png
└── README.md
```

---

## Running locally

Because PWAs require a real origin (service workers don't run from `file://`), serve the folder over HTTP:

```bash
# from inside the sojourn/ folder, pick whichever you have:
python -m http.server 8000
# or
npx serve .
# or
php -S localhost:8000
```

Then open <http://localhost:8000>.

---

## Deploy to GitHub Pages

Step by step, written for someone who has never deployed before.

### 1. Create a GitHub account & repo
1. Sign in (or sign up) at <https://github.com>.
2. Click the **+** in the top-right and choose **New repository**.
3. Name it `sojourn` (or anything you like). Keep it **Public**. Don't check "Add a README" — we already have one. Click **Create repository**.

### 2. Push these files
GitHub will show you commands. If you have `git` installed, from the `sojourn/` folder run:

```bash
git init
git add .
git commit -m "Initial commit: Sojourn"
git branch -M main
git remote add origin https://github.com/<your-username>/sojourn.git
git push -u origin main
```

If you don't have `git`, the GitHub site lets you drag-and-drop the files into the empty repo via the **uploading an existing file** link.

### 3. Enable Pages
1. In the repo, click **Settings** (top tab).
2. In the left sidebar click **Pages**.
3. Under **Build and deployment** → **Source**, pick **Deploy from a branch**.
4. Under **Branch**, pick **`main`** and folder **`/ (root)`**. Click **Save**.
5. Wait about 30 – 60 seconds. The page will refresh with your live URL, something like:

   `https://<your-username>.github.io/sojourn/`

Open it. The first load installs the PWA shell; on phones, tap **Share → Add to Home Screen** (iOS) or the install prompt (Android / desktop Chrome) to install it like a native app.

> **Note:** Because GitHub Pages serves your site from a subpath like `/sojourn/`, Sojourn intentionally uses **relative paths** for every asset (`./styles.css`, `./manifest.json`, `icons/icon.svg`, etc.). Don't change them to absolute paths starting with `/` — they will 404.

### 4. Push updates later
After any change to the code:
```bash
git add .
git commit -m "Update"
git push
```
Pages redeploys within ~1 minute. Users who already have it installed will get the new version on the next launch (the service worker is network-first for HTML).

---

## Privacy

Sojourn is 100% client-side. Every task, bill, and setting lives in your browser's `localStorage`. There is no server, no analytics, no telemetry. Clearing your browser data clears Sojourn — so use **Settings → Export backup (JSON)** before switching devices.

---

## Roadmap / Future

The original product vision included a few capabilities that are deliberately out of scope for v1 because they require credentials, OAuth flows, or a backend — things that don't fit a pure-static, no-account app. They remain compelling future directions:

- **Automatic data collection from school portals & bill emails.** A future version could ingest deadline emails (assignment notifications, exam schedules) and recurring bills from a forwarded inbox, then ask the user to confirm each detected item before saving. This needs an email backend, a parser, and per-school adapters — out of scope here, but the natural next step.
- **Two-way calendar sync.** Today's `.ics` export is one-shot — a snapshot of your obligations at the moment you click the button. A future version could use the Google Calendar / Microsoft Graph APIs to keep a live Sojourn calendar in sync with your real calendar (edit on one side, update on the other), so the user never has to re-export.
- **Smart reminders before due dates** with push notifications (`Notification` + `PushManager`), not just the in-app indicators we have today.
- **Multi-device sync** via end-to-end-encrypted optional cloud (so the no-account default still holds for users who don't want it).
- **Bill prediction** — once a few months of bills are logged, surface expected next amounts based on history.

---

## License

MIT — do what you like, no warranty.
