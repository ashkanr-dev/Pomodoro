# Pomodoro Tracker

A Next.js app — frontend and backend in one project — for tracking how long
tasks take using the Pomodoro method. No login: open the site and start.

## The cycle

```
Focus 25m → rest 5m → Focus 25m → rest 5m → Focus 25m → break 25m
```

Three 25-minute focus rounds with a 5-minute rest between each, then a
25-minute break at the end. Every interval is written to the server when it
ends, so the time each task consumed is a recorded fact rather than a guess.

All four durations and the number of focus rounds are adjustable in the
**Cycle** panel if you want a different rhythm.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
```

For production:

```bash
npm run build
npm run start
```

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tests are plain TypeScript run by Node's built-in test runner — no test
framework, no extra dependencies. They cover the cycle rules, the stats
rollups (including the timezone handling behind "today") and the datastore's
concurrency and failure behaviour. Node 22.18+ is required, since the runner
strips the types itself.

CI runs all four steps on every pull request.

## How it works

**No accounts.** On first visit the browser generates a random id and stores it
in `localStorage`, then sends it with every request as the `x-pomodoro-user`
header. That keeps two people on the same deployment from seeing each other's
tasks, without anyone signing up. Clearing site data starts you over.

**The timer is timestamp-driven.** Nothing counts down by decrementing a
number — remaining time is always derived from `Date.now()` against the instant
the interval started. That means it doesn't drift, it survives a background tab
being throttled, and it survives a reload: come back mid-interval and the clock
picks up where it should be. If you were away long enough for the interval to
have finished, the app credits exactly the planned duration (not the wall-clock
gap) and waits for you instead of chain-starting the rest of the cycle.

**What gets recorded.** Each interval is stored with its planned duration, the
time actually spent running (paused time excluded), start and end timestamps,
and whether it ran to completion or was cut short. Skipping an interval still
banks the time already spent, so nothing real is lost. Intervals shorter than
five seconds are dropped as noise.

### Storage

Data lives in a JSON file at `data/db.json` (git-ignored), written atomically
through a serialised queue so concurrent requests can't interleave. Point
`POMODORO_DATA_DIR` elsewhere to move it. The storage layer is isolated in
`src/lib/db.ts` — swapping in SQLite or Postgres means rewriting that one file.

## API

All routes take the `x-pomodoro-user` header.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/tasks` | Tasks with per-task focus totals (`?includeArchived=true` to include archived) |
| `POST` | `/api/tasks` | Create a task — `{ "title": "…" }` |
| `GET` | `/api/tasks/:id` | One task with its stats |
| `PATCH` | `/api/tasks/:id` | Update `title`, `done`, or `archived` |
| `DELETE` | `/api/tasks/:id` | Delete a task; its logged intervals stay in history |
| `GET` | `/api/sessions` | Recent intervals (`?taskId=…`, `?limit=…`) |
| `POST` | `/api/sessions` | Record a finished interval |
| `GET` | `/api/stats` | Totals, today, last 7 days, per-task (`?tzOffset=…` in minutes) |

## Layout

```
src/
  app/
    api/{tasks,tasks/[id],sessions,stats}/route.ts   Route handlers
    page.tsx, layout.tsx, globals.css
  components/    TimerDial, CycleTrack, TaskPanel, StatsPanel, SettingsPanel
  hooks/         usePomodoro (the timer), useSettings
  lib/           db, stats, pomodoro (cycle rules), client, persistent-store
tests/           pomodoro, stats, db
```

Built with Next.js 16 (App Router), React 19, TypeScript and Tailwind CSS v4.
