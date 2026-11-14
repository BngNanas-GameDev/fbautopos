# FB Autopost

Local, headed-browser Facebook group autoposter with a React control panel.
Built with **Playwright** because the Facebook Groups publishing API is no longer
available — this drives a real Chrome session instead.

> ⚠️ Automating Facebook group posting is against Facebook's Terms of Service and
> risks account restrictions. Posting identical content to many groups is a strong
> spam signal. Use delays, caps, and vary your content. Use at your own risk.

## Features

- **Headed Playwright** with a persistent Chrome profile (log in once).
- **Stealth defaults**: real Chrome channel, `navigator.webdriver` override,
  consistent locale/timezone, human-like typing and delays.
- **Auto-discover** your Facebook groups and toggle which ones to post to.
- **Scheduled posting** every N hours or via cron, with per-group dedupe.
- **Text + link** posts (Facebook builds the link preview itself).
- **Dry-run** mode that composes but never clicks Post.
- **Web GUI** (React): dashboard, live logs, content editor with preview,
  group manager, and schedule settings.
- **Safety**: max groups per run, minimum gap between groups, abort on
  checkpoint/block screens, screenshots on failure.

## Requirements

- Node.js 18+ (tested on Node 24)
- Google Chrome installed (falls back to Playwright's Chromium if needed)
- Windows/macOS/Linux with a desktop session (headed browser)

## Setup

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm run build
npm start
```

Open <http://127.0.0.1:3001>.

For development with hot reload:

```bash
npm run dev               # Vite on :5173, API on :3001
```

## First use

1. **Login** — click *Login to Facebook*, sign in in the window that opens.
   The session persists in the `auth/` profile folder.
2. **Discover groups** — scans the groups your account belongs to.
3. **Content** — write the message and add a link.
4. **Dry run** — verify the composer works without posting.
5. **Run now** or start the scheduler.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server + API with watch |
| `npm run build` | Build the React app into `web/dist` |
| `npm start` | Serve UI + API on `127.0.0.1:3001` |
| `npm run login` | CLI login (same as the GUI button) |
| `npm run post` | One posting pass from the CLI |
| `npm run post:dry` | One dry-run pass from the CLI |

## Project layout

```
src/
  server/        Express API, scheduler, job runner, JSON store, logger
  automation/    Playwright browser, login, discovery, posting, orchestrator
web/             React + Vite frontend
config/          Runtime JSON (content, groups, settings, state) — gitignored
auth/            Persistent Chrome profile — gitignored
logs/            App log + failure screenshots — gitignored
```

## Notes

- Facebook's DOM changes often. Posting uses multiple selector fallbacks and
  saves screenshots to `logs/` when something fails, so selectors can be retuned.
- Everything runs locally; nothing is uploaded to a third party.
- The scheduler is in-process, so the machine must stay on.
