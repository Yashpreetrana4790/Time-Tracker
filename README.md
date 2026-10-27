# Time Tracker: desktop tracker + admin panel

A working end-to-end time tracker:

- **desktop/**: Electron + React + Tailwind (electron-vite). Login, project picker, clock in/out, break,
  switch project, **idle detection**, **random-interval screenshots** of all monitors, tray icon.
- **server/**: Express + TypeScript + Prisma + **SQLite**. JWT auth, timer state machine, screenshot uploads.
- **admin/**: React + Vite + Tailwind. Live overview, per-day timeline and screenshots, projects, settings.

## Run it

Prerequisites: **Node 20+** and **pnpm 9+**. Docker is not needed.

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts all three apps:

| App | URL / window | Login |
| --- | --- | --- |
| API server | http://localhost:4000 | n/a |
| Admin panel | http://localhost:5180 | `admin@demo.com` / `admin123` |
| Desktop app | Electron window (380×600) + tray / menu-bar icon | `emp1@demo.com` or `emp2@demo.com` / `emp123` |

On startup the server creates the SQLite DB (`server/prisma/dev.db`) and seeds it. The seed is idempotent.
To wipe all data, run `pnpm db:reset`.

Demo-friendly timings live in `server/.env`. An admin can also change them on the **Settings** page,
and running desktop apps pick the change up within about 30 s.

| Setting | Demo value | Production default |
| --- | --- | --- |
| `IDLE_THRESHOLD_SEC` | 60 (1 min) | 300 (5 min) |
| `AUTO_CLOCK_OUT_SEC` | 7200 (2 h) | 7200 |
| `SCREENSHOT_INTERVAL_SEC` | 60 (1 min) | 600 (10 min) |

### macOS: Screen Recording permission
The first screenshot triggers the macOS prompt. If the permission is missing, the desktop app shows a banner
with an **Open settings** button. Enable **Electron** (the dev binary) under *System Settings → Privacy & Security
→ Screen & System Audio Recording*, then restart `pnpm dev`. Without the permission, no screenshots are uploaded,
because macOS would only return the wallpaper.

## Demo script (about 5 minutes)

1. **Desktop:** sign in as `emp1@demo.com`. Pick a project in the searchable dropdown and click **Clock In**.
   The big timer starts and the pill shows **Working**.
2. **Admin** (localhost:5180, Live overview): Alex shows as *Working* on that project. The page refreshes every 5 s.
3. **Break → Resume → Switch Project**: each one closes the current segment and opens a new one. Open
   *Timeline & screenshots* in admin to see contiguous colored segments with no gaps or overlaps.
4. **Screenshots:** within about 1 minute of working, a screenshot appears in the admin. Click it to enlarge.
   Shots are taken at a random moment inside each 1-min window, and only while *Working*.
5. **Idle:** take your hands off the keyboard and mouse for more than 1 minute. Within 10 s the pill turns
   **Idle**. In admin, the IDLE segment starts *when you last touched the input*, not when it was detected.
   Move the mouse: it returns to **Working** on the same project, with no popup.
6. **Restart persistence:** quit from the tray (*Quit*) and run `pnpm dev:desktop`. You are still signed in,
   and the timer shows the correct elapsed time.
7. **Auto clock-out:** in admin *Settings*, set *Auto clock-out after idle* to `1.5` min. Go idle for about
   1.5 min. The session closes **at the moment idling began** (reason `IDLE_TIMEOUT`), and the desktop shows
   "You were auto clocked out at HH:MM".
8. **Offline queue:** stop the server while working. Screenshots queue locally ("N item(s) waiting to sync")
   and upload when the server is back.

## How it works

### Data model (`server/prisma/schema.prisma`)
`User`, `Project`, `ProjectAssignment`, `WorkSession` (clockIn, clockOut, closeReason), `TimeSegment`
(WORK | BREAK | IDLE, projectId, start, end), `Screenshot`, and `Setting` (admin overrides of the `.env` defaults).
SQLite has no enums, so those fields are strings.

### Timer state machine (`server/src/timer.ts`)
- Every change goes through `transition()`. It closes the open segment at instant `t` and opens the next one at
  the same instant `t`, so segments can't leave gaps or overlap. Zero-length segments are dropped.
- **The server sets every timestamp.** The one exception is `idle-start`, which takes `idleSince`. The server
  clamps it to the range from the current segment's start to now.
- Changes are serialized per user (in-process lock plus a DB transaction), so a user click that races the idle
  detector can't corrupt state.
- Every timer endpoint returns the full state (status, current segment, today's totals, settings, notice), so
  the client never has to guess.
- **Safety-net sweep** (every 30 s): it auto clocks out sessions that have been IDLE longer than the limit, and
  WORK sessions whose desktop app stopped sending heartbeats for that long (app killed, laptop asleep).

### Desktop (`desktop/src/main`)
- `tracker.ts`: idle detection runs in the **main process** with `powerMonitor.getSystemIdleTime()` every 10 s.
  Return from idle is checked every 2 s so it feels instant. Idle detection doesn't run during Break.
  A heartbeat every 30 s also refreshes the settings.
- `screenshots.ts`: `desktopCapturer` captures **every display** (one JPEG at 60% quality per monitor, max
  1920 px wide). The windows are anchored to the moment work (re)starts. Every shot is written to a **local queue
  folder** first and then uploaded. Network or server errors leave it queued, and a retry runs every 60 s.
  The server rejects shots whose `takenAt` doesn't fall inside a WORK segment. This covers a shot taken just
  before a backdated idle period, so idle time never has screenshots.
- The auth token is stored in the app's `userData/auth.json`, so restarts stay signed in.
- Closing the window keeps the app running in the tray. On macOS the menu bar shows the live timer.

### API
| Method | Path | |
| --- | --- | --- |
| POST | `/auth/login` | `{email, password}` → `{token, user}` |
| GET | `/me` | current user |
| GET | `/projects/mine` | assigned, active projects |
| GET | `/timer/state` | full timer state |
| POST | `/timer/clock-in` | `{projectId}` |
| POST | `/timer/break`, `/timer/resume` | |
| POST | `/timer/switch` | `{projectId}` |
| POST | `/timer/idle-start` | `{idleSince}` (ISO) |
| POST | `/timer/idle-end` | idle → work on the same project |
| POST | `/timer/idle-timeout` | auto clock-out at idle start |
| POST | `/timer/clock-out` | |
| POST | `/timer/heartbeat`, `/timer/ack-notice` | |
| POST | `/screenshots` | multipart: `file`, `sessionId`, `takenAt`, `projectId`, `displayIndex` |
| GET | `/admin/overview` | live status of every employee |
| GET | `/admin/users/:id/day?date=YYYY-MM-DD` | sessions, segments, per-project totals, screenshots |
| GET/PUT | `/admin/settings` | |
| GET/POST/PATCH | `/admin/projects…` | including `PUT /admin/projects/:id/assignments` |
| GET | `/files/screenshots/:name?token=` | admin only |

## Notes and trade-offs
- "Today" uses the server's local timezone, which is fine for a single-machine demo.
- Returning from idle restarts the screenshot window, just like resuming from a break.
- `desktop/scripts/dev.mjs` waits for the API, then launches electron-vite. It also clears
  `ELECTRON_RUN_AS_NODE`, which shells spawned by VS Code inherit and which would otherwise make Electron start
  as plain Node.
