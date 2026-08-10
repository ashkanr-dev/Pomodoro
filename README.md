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

## Deploying

The app keeps its data in a file on disk, so it needs a host that gives it a
**persistent volume**. Everything else is standard.

> **Serverless hosts (Vercel, Netlify Functions, Cloudflare Workers) will not
> work as-is.** Their filesystems are ephemeral and per-instance, so tasks
> would appear to save and then silently vanish on the next deploy or the next
> request that lands elsewhere. Deploying there means replacing `src/lib/db.ts`
> with a hosted database first.

### Docker

```bash
docker compose up --build      # http://localhost:3000
```

Or without compose:

```bash
docker build -t pomodoro-tracker .
docker run -p 3000:3000 -v pomodoro-data:/data pomodoro-tracker
```

The image builds Next's standalone output, runs as a non-root user, and stores
data in `/data`. **Mount a volume there** — without one, the container still
runs, but every task is lost when it restarts.

### Any container host

Fly.io, Railway, Render, ECS, or a VPS all work the same way: build the
Dockerfile, attach a persistent disk at `/data`, and expose port 3000. On
Fly.io that's a `[mounts]` entry pointing at `/data`; on Render or Railway it's
a disk with `/data` as the mount path.

### Health checks

`GET /api/health` returns `200 {"status":"ok",…}` when the data volume is
writable and `503` when it isn't. Point the platform's health check at it: a
missing volume otherwise looks exactly like a fresh install, right up until
someone's history disappears. The Dockerfile wires this into `HEALTHCHECK`
already.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `POMODORO_DATA_DIR` | `./data` (`/data` in the image) | Where `db.json` is written |
| `PORT` | `3000` | Port the server listens on |
| `HOSTNAME` | `0.0.0.0` in the image | Bind address |

No secrets, no API keys, no database URL — there's nothing else to configure.

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
