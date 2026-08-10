import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";

import { checkDatabase, closePool, query } from "../src/lib/db.ts";
import {
  createSession,
  createTask,
  deleteTask,
  getTask,
  listAllSessions,
  listSessions,
  listTasks,
  updateTask,
} from "../src/lib/queries.ts";

/**
 * These run against a real Postgres — the same engine the app talks to in
 * production — so the SQL, the constraints and the ON DELETE behaviour are
 * genuinely exercised rather than mocked.
 */

const MINUTE = 60_000;
const USER = "user-alice";
const OTHER = "user-bob";

const hasDatabase = Boolean(process.env.DATABASE_URL);

before(() => {
  if (!hasDatabase) {
    // Skipping silently would let a broken build look green.
    throw new Error(
      "DATABASE_URL must be set to run the query tests. See README > Checks.",
    );
  }
});

beforeEach(async () => {
  // Sessions go first: they reference tasks.
  await query("DELETE FROM sessions");
  await query("DELETE FROM tasks");
});

after(async () => {
  await closePool();
});

function sessionInput(overrides: Partial<Parameters<typeof createSession>[1]> = {}) {
  return {
    taskId: null,
    kind: "focus" as const,
    stepIndex: 0,
    round: 1,
    plannedMs: 25 * MINUTE,
    durationMs: 25 * MINUTE,
    startedAt: new Date("2026-08-09T10:00:00.000Z"),
    endedAt: new Date("2026-08-09T10:25:00.000Z"),
    completed: true,
    ...overrides,
  };
}

test("the schema bootstraps and reports healthy", async () => {
  const counts = await checkDatabase();
  assert.deepEqual(counts, { tasks: 0, sessions: 0 });
});

test("a created task starts with zeroed stats", async () => {
  const task = await createTask(USER, "Write the report");

  assert.equal(task.title, "Write the report");
  assert.equal(task.completedAt, null);
  assert.equal(task.archived, false);
  assert.deepEqual(task.stats, {
    focusMs: 0,
    focusSessions: 0,
    completedFocusSessions: 0,
    lastActiveAt: null,
  });
});

test("focus time aggregates onto the task, breaks do not", async () => {
  const task = await createTask(USER, "Write the report");
  await createSession(USER, sessionInput({ taskId: task.id }));
  await createSession(
    USER,
    sessionInput({ taskId: task.id, durationMs: 10 * MINUTE, completed: false }),
  );
  // Breaks are recorded against no task at all.
  await createSession(USER, sessionInput({ kind: "longBreak", taskId: null }));

  const [found] = await listTasks(USER, false);
  assert.equal(found.stats.focusMs, 35 * MINUTE);
  assert.equal(found.stats.focusSessions, 2);
  assert.equal(found.stats.completedFocusSessions, 1);
  assert.equal(found.stats.lastActiveAt, "2026-08-09T10:25:00.000Z");
});

test("tasks list open first, then newest first", async () => {
  const first = await createTask(USER, "First");
  await createTask(USER, "Second");
  const third = await createTask(USER, "Third");
  await updateTask(USER, third.id, { done: true });

  const titles = (await listTasks(USER, false)).map((task) => task.title);
  assert.deepEqual(titles, ["Second", "First", "Third"]);
  assert.ok(first.id);
});

test("archived tasks are hidden unless asked for", async () => {
  const task = await createTask(USER, "Archived");
  await updateTask(USER, task.id, { archived: true });

  assert.deepEqual(await listTasks(USER, false), []);
  assert.equal((await listTasks(USER, true)).length, 1);
});

test("marking done twice keeps the original completion time", async () => {
  const task = await createTask(USER, "Finish me");

  const done = await updateTask(USER, task.id, { done: true });
  const again = await updateTask(USER, task.id, { done: true });
  assert.equal(again?.completedAt, done?.completedAt);

  const reopened = await updateTask(USER, task.id, { done: false });
  assert.equal(reopened?.completedAt, null);
});

test("a partial update leaves the other fields alone", async () => {
  const task = await createTask(USER, "Original");
  await updateTask(USER, task.id, { done: true });

  const renamed = await updateTask(USER, task.id, { title: "Renamed" });
  assert.equal(renamed?.title, "Renamed");
  assert.notEqual(renamed?.completedAt, null);
  assert.equal(renamed?.archived, false);
});

test("deleting a task keeps its logged time in history", async () => {
  const task = await createTask(USER, "Doomed");
  await createSession(USER, sessionInput({ taskId: task.id }));

  assert.equal(await deleteTask(USER, task.id), true);

  const [session] = await listAllSessions(USER);
  assert.equal(session.taskId, null);
  // The snapshot is what keeps the history readable after the task is gone.
  assert.equal(session.taskTitle, "Doomed");
});

test("one visitor cannot see or touch another's tasks", async () => {
  const mine = await createTask(USER, "Mine");
  await createTask(OTHER, "Theirs");

  assert.deepEqual(
    (await listTasks(USER, false)).map((task) => task.title),
    ["Mine"],
  );
  assert.equal(await getTask(OTHER, mine.id), null);
  assert.equal(await updateTask(OTHER, mine.id, { title: "Stolen" }), null);
  assert.equal(await deleteTask(OTHER, mine.id), false);

  // Still intact after all of that.
  assert.equal((await getTask(USER, mine.id))?.title, "Mine");
});

test("a session naming someone else's task records as unassigned", async () => {
  const theirs = await createTask(OTHER, "Their task");

  const session = await createSession(USER, sessionInput({ taskId: theirs.id }));
  assert.equal(session.taskId, null);
  // Their title must not leak through the snapshot either.
  assert.equal(session.taskTitle, null);
});

test("a malformed task id is treated as no task, not a crash", async () => {
  assert.equal(await getTask(USER, "not-a-uuid"), null);
  assert.equal(await deleteTask(USER, "not-a-uuid"), false);
  assert.equal(await updateTask(USER, "not-a-uuid", { title: "x" }), null);

  const session = await createSession(USER, sessionInput({ taskId: "nope" }));
  assert.equal(session.taskId, null);
});

test("sessions come back newest first and honour the limit", async () => {
  await createSession(
    USER,
    sessionInput({ endedAt: new Date("2026-08-07T10:00:00.000Z") }),
  );
  await createSession(
    USER,
    sessionInput({ endedAt: new Date("2026-08-09T10:00:00.000Z") }),
  );
  await createSession(
    USER,
    sessionInput({ endedAt: new Date("2026-08-08T10:00:00.000Z") }),
  );

  const all = await listSessions(USER, { limit: 10 });
  assert.deepEqual(
    all.map((s) => s.endedAt),
    [
      "2026-08-09T10:00:00.000Z",
      "2026-08-08T10:00:00.000Z",
      "2026-08-07T10:00:00.000Z",
    ],
  );

  const limited = await listSessions(USER, { limit: 1 });
  assert.equal(limited.length, 1);
});

test("sessions can be filtered to one task", async () => {
  const task = await createTask(USER, "Filtered");
  await createSession(USER, sessionInput({ taskId: task.id }));
  await createSession(USER, sessionInput({ taskId: null }));

  const filtered = await listSessions(USER, { taskId: task.id, limit: 10 });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].taskId, task.id);
});

test("durations survive the round trip through bigint columns", async () => {
  const task = await createTask(USER, "Precision");
  const written = await createSession(
    USER,
    sessionInput({ taskId: task.id, plannedMs: 1_500_000, durationMs: 1_499_987 }),
  );

  assert.equal(written.plannedMs, 1_500_000);
  assert.equal(written.durationMs, 1_499_987);
  assert.equal(typeof written.durationMs, "number");

  const [readBack] = await listAllSessions(USER);
  assert.equal(readBack.durationMs, 1_499_987);
});

test("an unknown phase kind is rejected by the database", async () => {
  await assert.rejects(
    createSession(USER, sessionInput({ kind: "nap" as "focus" })),
    /violates check constraint/,
  );
});
