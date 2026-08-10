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

The app stores everything in Postgres, so it needs a `DATABASE_URL`. The
quickest local database is the one in `docker-compose.yml`:

```bash
docker compose up -d db
export DATABASE_URL=postgres://pomodoro:pomodoro@localhost:5432/pomodoro

npm install
npm run dev      # http://localhost:3000
```

Any Postgres works — a local install, a free Neon or Supabase branch, whatever
you already have. The tables are created automatically on first request, so
there is no migration step to run.

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
framework, no extra dependencies. Node 22.18+ is required, since the runner
strips the types itself.

They cover the cycle rules and the stats rollups (including the timezone
handling behind "today") in process, and the queries against **a real
Postgres** rather than a fake — so the SQL, the constraints and the
`ON DELETE` behaviour are genuinely exercised. `npm test` needs `DATABASE_URL`
pointed at a throwaway database; it deletes all rows between tests.

CI runs all four steps on every pull request, with Postgres as a service
container.

## Deploying

State lives in Postgres, so the app itself is stateless and deploys anywhere.
It needs exactly one environment variable: `DATABASE_URL`.

### Vercel

```bash
vercel link
vercel env add DATABASE_URL        # paste the pooled connection string
vercel --prod
```

Provision Postgres first — Vercel's own Postgres integration, Neon, or Supabase
all work. **Use the provider's pooled connection string** (the one with
`-pooler` in the host, or Supabase's port 6543). Serverless functions open a
pool per instance and instances churn, so a direct connection string will
exhaust the server's connection limit under any real use.

No build configuration is needed; Next.js is detected automatically. The schema
is created on the first request that touches the database.

### Docker

```bash
docker compose up --build      # app + Postgres, http://localhost:3000
```

The image builds Next's standalone output and runs as a non-root user. The app
container holds no state — only the `pomodoro-db` volume does.

To run just the app against an existing database:

```bash
docker build -t pomodoro-tracker .
docker run -p 3000:3000 -e DATABASE_URL=postgres://… pomodoro-tracker
```

### Any container host

Fly.io, Railway, Render, ECS, or a VPS all work the same way: build the
Dockerfile, set `DATABASE_URL`, expose port 3000. Nothing needs a persistent
disk.

### Health checks

`GET /api/health` returns `200 {"status":"ok",…}` when the database is
reachable and the schema is in place, and `503` with the reason when it isn't.
Point the platform's health check at it — it runs a real query, so a missing
`DATABASE_URL` or a database the app can't create tables in surfaces here
rather than as a 500 the first time someone saves a task. The Dockerfile wires
this into `HEALTHCHECK` already.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | *(required)* | Postgres connection string; use the pooled endpoint |
| `PG_POOL_MAX` | `3` | Connections per instance |
| `PG_SSL_NO_VERIFY` | unset | Set to `1` only if the provider serves a certificate the client can't chain |
| `PORT` | `3000` | Port the server listens on |
| `HOSTNAME` | `0.0.0.0` in the image | Bind address |

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

Two tables in Postgres, `tasks` and `sessions`. Connection and schema live in
`src/lib/db.ts`; every query is in `src/lib/queries.ts` and is scoped by
`user_id`, so one visitor's request can't reach another's rows.

The schema is created on demand under a Postgres advisory lock — `IF NOT
EXISTS` alone races when several cold serverless instances boot at once. There
is no migration tool: the schema is small enough that this is the whole story.

Deleting a task doesn't erase its history. The foreign key is
`ON DELETE SET NULL` and each interval keeps a snapshot of the task title, so
past focus time still shows up in the stats.

Per-task totals are aggregated in SQL. The dashboard rollup is computed in
process instead, because bucketing by day depends on the viewer's timezone
offset — one person's interval history is small enough that this stays cheap.

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
| `GET` | `/api/health` | Database reachability probe; `503` when it isn't |

## Layout

```
src/
  app/
    api/{tasks,tasks/[id],sessions,stats,health}/route.ts   Route handlers
    page.tsx, layout.tsx, globals.css
  components/    TimerDial, CycleTrack, TaskPanel, StatsPanel, SettingsPanel
  hooks/         usePomodoro (the timer), useSettings
  lib/           db + queries (Postgres), stats, pomodoro (cycle rules),
                 client, persistent-store
tests/           pomodoro, stats, queries
```

Built with Next.js 16 (App Router), React 19, TypeScript and Tailwind CSS v4.
