import { randomUUID } from "node:crypto";

// Explicit extension: the tests import this module straight into Node, which
// resolves ESM specifiers literally.
import { query } from "./db.ts";
import type { PhaseKind, SessionRecord, TaskWithStats } from "./types";

/**
 * Every query is scoped by `user_id`. There are no accounts, but the anonymous
 * per-browser id still has to partition the data — a request must never be
 * able to reach another visitor's rows.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres rejects malformed uuids outright, so filter them out first. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  archived: boolean;
  focus_ms: string | null;
  focus_sessions: string | null;
  completed_focus_sessions: string | null;
  last_active_at: Date | null;
}

interface SessionRow {
  id: string;
  user_id: string;
  task_id: string | null;
  task_title: string | null;
  kind: PhaseKind;
  step_index: number;
  round: number;
  planned_ms: string;
  duration_ms: string;
  started_at: Date;
  ended_at: Date;
  completed: boolean;
}

function toTask(row: TaskRow): TaskWithStats {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    archived: row.archived,
    stats: {
      // Aggregates come back as strings, since bigint doesn't fit a JS number.
      focusMs: Number(row.focus_ms ?? 0),
      focusSessions: Number(row.focus_sessions ?? 0),
      completedFocusSessions: Number(row.completed_focus_sessions ?? 0),
      lastActiveAt: row.last_active_at?.toISOString() ?? null,
    },
  };
}

function toSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    taskId: row.task_id,
    taskTitle: row.task_title,
    kind: row.kind,
    stepIndex: row.step_index,
    round: row.round,
    plannedMs: Number(row.planned_ms),
    durationMs: Number(row.duration_ms),
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at.toISOString(),
    completed: row.completed,
  };
}

const TASK_SELECT = `
  SELECT t.*,
         COALESCE(SUM(s.duration_ms) FILTER (WHERE s.kind = 'focus'), 0) AS focus_ms,
         COUNT(s.id)   FILTER (WHERE s.kind = 'focus')                   AS focus_sessions,
         COUNT(s.id)   FILTER (WHERE s.kind = 'focus' AND s.completed)   AS completed_focus_sessions,
         MAX(s.ended_at) FILTER (WHERE s.kind = 'focus')                 AS last_active_at
    FROM tasks t
    LEFT JOIN sessions s ON s.task_id = t.id AND s.user_id = t.user_id
`;

export async function listTasks(
  userId: string,
  includeArchived: boolean,
): Promise<TaskWithStats[]> {
  const rows = await query<TaskRow>(
    `${TASK_SELECT}
      WHERE t.user_id = $1
        AND ($2::boolean OR NOT t.archived)
      GROUP BY t.id
      -- Open tasks first, newest first within each group.
      ORDER BY (t.completed_at IS NOT NULL), t.created_at DESC`,
    [userId, includeArchived],
  );
  return rows.map(toTask);
}

export async function getTask(
  userId: string,
  id: string,
): Promise<TaskWithStats | null> {
  if (!isUuid(id)) return null;
  const rows = await query<TaskRow>(
    `${TASK_SELECT} WHERE t.user_id = $1 AND t.id = $2 GROUP BY t.id`,
    [userId, id],
  );
  return rows[0] ? toTask(rows[0]) : null;
}

export async function createTask(
  userId: string,
  title: string,
): Promise<TaskWithStats> {
  const rows = await query<TaskRow>(
    `INSERT INTO tasks (id, user_id, title)
          VALUES ($1, $2, $3)
       RETURNING *, 0 AS focus_ms, 0 AS focus_sessions,
                 0 AS completed_focus_sessions, NULL AS last_active_at`,
    [randomUUID(), userId, title],
  );
  return toTask(rows[0]);
}

export async function updateTask(
  userId: string,
  id: string,
  patch: { title?: string; done?: boolean; archived?: boolean },
): Promise<TaskWithStats | null> {
  if (!isUuid(id)) return null;

  const updated = await query<{ id: string }>(
    `UPDATE tasks
        SET title = COALESCE($3, title),
            -- Keep the original completion time when it's already done.
            completed_at = CASE
              WHEN $4::boolean IS NULL THEN completed_at
              WHEN $4::boolean THEN COALESCE(completed_at, now())
              ELSE NULL
            END,
            archived = COALESCE($5, archived),
            updated_at = now()
      WHERE user_id = $1 AND id = $2
      RETURNING id`,
    [
      userId,
      id,
      patch.title ?? null,
      patch.done ?? null,
      patch.archived ?? null,
    ],
  );

  return updated[0] ? getTask(userId, id) : null;
}

export async function deleteTask(userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await query<{ id: string }>(
    `DELETE FROM tasks WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, id],
  );
  return rows.length > 0;
}

export async function listSessions(
  userId: string,
  options: { taskId?: string | null; limit: number },
): Promise<SessionRecord[]> {
  const taskId = isUuid(options.taskId) ? options.taskId : null;
  const rows = await query<SessionRow>(
    `SELECT * FROM sessions
       WHERE user_id = $1
         AND ($2::uuid IS NULL OR task_id = $2::uuid)
       ORDER BY ended_at DESC
       LIMIT $3`,
    [userId, taskId, options.limit],
  );
  return rows.map(toSession);
}

/** Every session for the user, for the in-process stats rollup. */
export async function listAllSessions(
  userId: string,
): Promise<SessionRecord[]> {
  const rows = await query<SessionRow>(
    `SELECT * FROM sessions WHERE user_id = $1`,
    [userId],
  );
  return rows.map(toSession);
}

export interface NewSession {
  taskId: string | null;
  kind: PhaseKind;
  stepIndex: number;
  round: number;
  plannedMs: number;
  durationMs: number;
  startedAt: Date;
  endedAt: Date;
  completed: boolean;
}

export async function createSession(
  userId: string,
  input: NewSession,
): Promise<SessionRecord> {
  const taskId = isUuid(input.taskId) ? input.taskId : null;

  // The task lookup is scoped to the user, so an id belonging to someone else
  // silently records as unassigned rather than leaking their task title.
  const rows = await query<SessionRow>(
    `WITH owned AS (
       SELECT id, title FROM tasks WHERE id = $3::uuid AND user_id = $2
     )
     INSERT INTO sessions (
       id, user_id, task_id, task_title, kind, step_index, round,
       planned_ms, duration_ms, started_at, ended_at, completed
     )
     VALUES (
       $1, $2,
       (SELECT id FROM owned), (SELECT title FROM owned),
       $4, $5, $6, $7, $8, $9, $10, $11
     )
     RETURNING *`,
    [
      randomUUID(),
      userId,
      taskId,
      input.kind,
      input.stepIndex,
      input.round,
      input.plannedMs,
      input.durationMs,
      input.startedAt.toISOString(),
      input.endedAt.toISOString(),
      input.completed,
    ],
  );
  return toSession(rows[0]);
}
