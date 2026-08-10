import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SessionRecord, Task } from "./types";

/**
 * Tiny JSON-file datastore.
 *
 * The app has no login and is meant to run as a single process, so a file is
 * plenty. Everything goes through `mutate()`, which serialises access on a
 * promise chain and writes atomically (tmp file + rename), so concurrent
 * requests can't interleave a read-modify-write.
 */

interface Database {
  tasks: Task[];
  sessions: SessionRecord[];
}

const EMPTY_DB: Database = { tasks: [], sessions: [] };

const DATA_DIR =
  process.env.POMODORO_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

let queue: Promise<unknown> = Promise.resolve();
let cache: Database | null = null;

function isDatabase(value: unknown): value is Database {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Database>;
  return Array.isArray(candidate.tasks) && Array.isArray(candidate.sessions);
}

async function load(): Promise<Database> {
  if (cache) return cache;
  try {
    const raw = await readFile(DB_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);
    cache = isDatabase(parsed)
      ? { tasks: parsed.tasks, sessions: parsed.sessions }
      : { ...EMPTY_DB };
  } catch {
    // Missing or unreadable file: start from an empty database.
    cache = { ...EMPTY_DB };
  }
  return cache;
}

async function persist(db: Database): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await rename(tmp, DB_FILE);
  cache = db;
}

/** Runs `fn` against the database without writing anything back. */
export function read<T>(fn: (db: Database) => T): Promise<T> {
  const next = queue.then(async () => fn(await load()));
  queue = next.catch(() => undefined);
  return next;
}

/** Runs `fn` against the database and persists the result. */
export function mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const current = await load();
    // Work on a copy so a throwing `fn` cannot leave the cache half-updated.
    const draft: Database = {
      tasks: [...current.tasks],
      sessions: [...current.sessions],
    };
    const result = await fn(draft);
    await persist(draft);
    return result;
  });
  queue = next.catch(() => undefined);
  return next;
}

export function newId(): string {
  return randomUUID();
}
