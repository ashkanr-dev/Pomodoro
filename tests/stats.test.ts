import assert from "node:assert/strict";
import test from "node:test";

import { buildStats, dayKey, withStats } from "../src/lib/stats.ts";
import type { PhaseKind, SessionRecord, Task } from "../src/lib/types.ts";

const MINUTE = 60_000;

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: Math.random().toString(36).slice(2),
    userId: "user",
    taskId: "task-1",
    taskTitle: "Write the report",
    kind: "focus" as PhaseKind,
    stepIndex: 0,
    round: 1,
    plannedMs: 25 * MINUTE,
    durationMs: 25 * MINUTE,
    startedAt: "2026-08-09T10:00:00.000Z",
    endedAt: "2026-08-09T10:25:00.000Z",
    completed: true,
    ...overrides,
  };
}

const task: Task = {
  id: "task-1",
  userId: "user",
  title: "Write the report",
  createdAt: "2026-08-09T09:00:00.000Z",
  updatedAt: "2026-08-09T09:00:00.000Z",
  completedAt: null,
  archived: false,
};

test("per-task totals count only that task's focus intervals", () => {
  const result = withStats(task, [
    session(),
    session({ durationMs: 10 * MINUTE, completed: false }),
    session({ taskId: "task-2", taskTitle: "Something else" }),
    // Breaks are never attributed to a task.
    session({ kind: "longBreak", taskId: null, taskTitle: null }),
  ]);

  assert.equal(result.stats.focusMs, 35 * MINUTE);
  assert.equal(result.stats.focusSessions, 2);
  assert.equal(result.stats.completedFocusSessions, 1);
});

test("lastActiveAt is the most recent focus interval on the task", () => {
  const result = withStats(task, [
    session({ endedAt: "2026-08-07T10:25:00.000Z" }),
    session({ endedAt: "2026-08-09T18:00:00.000Z" }),
    session({ endedAt: "2026-08-08T11:00:00.000Z" }),
  ]);

  assert.equal(result.stats.lastActiveAt, "2026-08-09T18:00:00.000Z");
});

test("a task with no logged time reports zeroes, not nulls", () => {
  const result = withStats(task, []);
  assert.deepEqual(result.stats, {
    focusMs: 0,
    focusSessions: 0,
    completedFocusSessions: 0,
    lastActiveAt: null,
  });
});

test("totals separate focus from break time", () => {
  const stats = buildStats(
    [
      session(),
      session({ durationMs: 12 * MINUTE, completed: false }),
      session({ kind: "shortBreak", durationMs: 5 * MINUTE, taskId: null }),
      session({ kind: "longBreak", durationMs: 25 * MINUTE, taskId: null }),
    ],
    0,
    new Date("2026-08-09T20:00:00.000Z"),
  );

  assert.equal(stats.totals.focusMs, 37 * MINUTE);
  assert.equal(stats.totals.breakMs, 30 * MINUTE);
  assert.equal(stats.totals.focusSessions, 2);
  assert.equal(stats.totals.completedFocusSessions, 1);
});

test("a cycle counts only when the long break runs to the end", () => {
  const stats = buildStats(
    [
      session({ kind: "longBreak", taskId: null, completed: true }),
      session({ kind: "longBreak", taskId: null, completed: false }),
      session({ kind: "shortBreak", taskId: null, completed: true }),
    ],
    0,
    new Date("2026-08-09T20:00:00.000Z"),
  );

  assert.equal(stats.totals.cyclesCompleted, 1);
});

test("last7Days is seven consecutive days ending today", () => {
  const stats = buildStats([session()], 0, new Date("2026-08-09T20:00:00.000Z"));

  assert.equal(stats.last7Days.length, 7);
  assert.equal(stats.last7Days[0].date, "2026-08-03");
  assert.equal(stats.last7Days[6].date, "2026-08-09");
  assert.equal(stats.last7Days[6].focusMs, 25 * MINUTE);
  assert.equal(stats.last7Days[0].focusMs, 0);
});

test("'today' follows the viewer's timezone, not the server's", () => {
  // 23:30 UTC is already tomorrow for a viewer at UTC+2.
  const lateNight = [session({ endedAt: "2026-08-09T23:30:00.000Z" })];
  const now = new Date("2026-08-10T09:00:00.000Z");

  assert.equal(buildStats(lateNight, 0, now).today.focusMs, 0);
  assert.equal(buildStats(lateNight, -120, now).today.focusMs, 25 * MINUTE);
});

test("dayKey shifts by the browser's offset", () => {
  const instant = new Date("2026-08-09T23:30:00.000Z");
  assert.equal(dayKey(instant, 0), "2026-08-09");
  assert.equal(dayKey(instant, -120), "2026-08-10");
  assert.equal(dayKey(instant, 480), "2026-08-09");
});

test("per-task rollups group by task and sort by time spent", () => {
  const stats = buildStats(
    [
      session({ taskId: "task-1", taskTitle: "Small", durationMs: 5 * MINUTE }),
      session({ taskId: "task-2", taskTitle: "Big", durationMs: 50 * MINUTE }),
      session({ taskId: "task-2", taskTitle: "Big", durationMs: 25 * MINUTE }),
      // Focus time logged with no task selected still shows up.
      session({ taskId: null, taskTitle: null, durationMs: 10 * MINUTE }),
    ],
    0,
    new Date("2026-08-09T20:00:00.000Z"),
  );

  assert.deepEqual(stats.perTask, [
    { taskId: "task-2", taskTitle: "Big", focusMs: 75 * MINUTE, focusSessions: 2 },
    { taskId: null, taskTitle: "Unassigned", focusMs: 10 * MINUTE, focusSessions: 1 },
    { taskId: "task-1", taskTitle: "Small", focusMs: 5 * MINUTE, focusSessions: 1 },
  ]);
});

test("an empty history produces zeroed stats rather than throwing", () => {
  const stats = buildStats([], 0, new Date("2026-08-09T20:00:00.000Z"));

  assert.equal(stats.totals.focusMs, 0);
  assert.equal(stats.totals.cyclesCompleted, 0);
  assert.equal(stats.today.focusSessions, 0);
  assert.deepEqual(stats.perTask, []);
  assert.equal(stats.last7Days.length, 7);
});
