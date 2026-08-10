import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Postgres connection and schema bootstrap.
 *
 * The app runs on serverless functions, where every instance opens its own
 * pool and instances come and go constantly. Keep `max` small and point
 * `DATABASE_URL` at the provider's *pooled* endpoint (pgbouncer on Neon,
 * Supabase's pooler) or connections will pile up faster than they're reclaimed.
 */

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS tasks (
    id           uuid        PRIMARY KEY,
    user_id      text        NOT NULL,
    title        text        NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    archived     boolean     NOT NULL DEFAULT false
  );

  CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON tasks (user_id);

  CREATE TABLE IF NOT EXISTS sessions (
    id          uuid        PRIMARY KEY,
    user_id     text        NOT NULL,
    -- Deleting a task keeps its history: the link drops, the snapshot stays.
    task_id     uuid        REFERENCES tasks (id) ON DELETE SET NULL,
    task_title  text,
    kind        text        NOT NULL CHECK (kind IN ('focus', 'shortBreak', 'longBreak')),
    step_index  integer     NOT NULL,
    round       integer     NOT NULL,
    planned_ms  bigint      NOT NULL,
    duration_ms bigint      NOT NULL,
    started_at  timestamptz NOT NULL,
    ended_at    timestamptz NOT NULL,
    completed   boolean     NOT NULL
  );

  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
  CREATE INDEX IF NOT EXISTS sessions_task_id_idx ON sessions (task_id);
`;

/** Arbitrary but stable key for the advisory lock guarding schema creation. */
const SCHEMA_LOCK_KEY = 4_872_119_034;

let pool: Pool | null = null;

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Point it at a Postgres database — see the README.",
    );
  }

  pool ??= new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Escape hatch for providers serving certificates this client can't chain.
    ssl:
      process.env.PG_SSL_NO_VERIFY === "1"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  return pool;
}

let schemaReady: Promise<void> | null = null;

/**
 * Creates the schema if it isn't there yet, once per process.
 *
 * `IF NOT EXISTS` alone still races when several cold instances boot at the
 * same time, so the DDL runs under an advisory lock. On failure the cached
 * promise is cleared so the next request retries rather than inheriting it.
 */
export function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    const client: PoolClient = await getPool().connect();
    try {
      await client.query("SELECT pg_advisory_lock($1)", [SCHEMA_LOCK_KEY]);
      try {
        await client.query(SCHEMA);
      } finally {
        await client.query("SELECT pg_advisory_unlock($1)", [SCHEMA_LOCK_KEY]);
      }
    } finally {
      client.release();
    }
  })().catch((cause: unknown) => {
    schemaReady = null;
    throw cause;
  });

  return schemaReady;
}

/** Runs a query, bootstrapping the schema first. */
export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureSchema();
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/**
 * Verifies the database is reachable and writable, for health probes.
 *
 * It does a real round-trip through the schema bootstrap rather than a bare
 * `SELECT 1`, because a reachable database the app has no rights to create
 * tables in would otherwise look perfectly healthy.
 */
export async function checkDatabase(): Promise<{
  tasks: number;
  sessions: number;
}> {
  const rows = await query<{ tasks: string; sessions: string }>(
    `SELECT (SELECT count(*) FROM tasks)    AS tasks,
            (SELECT count(*) FROM sessions) AS sessions`,
  );
  return {
    tasks: Number(rows[0]?.tasks ?? 0),
    sessions: Number(rows[0]?.sessions ?? 0),
  };
}

/** Closes the pool. Used by tests; serverless instances just get torn down. */
export async function closePool(): Promise<void> {
  const existing = pool;
  pool = null;
  schemaReady = null;
  await existing?.end();
}
