import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlan,
  clampSettings,
  cycleDurationMs,
  DEFAULT_SETTINGS,
  formatClock,
  formatDuration,
  type Settings,
} from "../src/lib/pomodoro.ts";

const MINUTE = 60_000;

test("the default plan is the method: 3 × focus with rests, then a long break", () => {
  const plan = buildPlan(DEFAULT_SETTINGS);

  assert.deepEqual(
    plan.map((step) => step.kind),
    ["focus", "shortBreak", "focus", "shortBreak", "focus", "longBreak"],
  );
  assert.deepEqual(
    plan.map((step) => step.durationMs / MINUTE),
    [25, 5, 25, 5, 25, 25],
  );
  assert.deepEqual(
    plan.map((step) => step.round),
    [1, 1, 2, 2, 3, 3],
  );
  assert.deepEqual(
    plan.map((step) => step.index),
    [0, 1, 2, 3, 4, 5],
  );
  assert.equal(cycleDurationMs(DEFAULT_SETTINGS), 110 * MINUTE);
});

test("a single round has no short rest, just focus then the long break", () => {
  const plan = buildPlan({ ...DEFAULT_SETTINGS, rounds: 1 });
  assert.deepEqual(
    plan.map((step) => step.kind),
    ["focus", "longBreak"],
  );
});

test("the plan always ends on a long break, whatever the round count", () => {
  for (const rounds of [1, 2, 3, 4, 8]) {
    const plan = buildPlan({ ...DEFAULT_SETTINGS, rounds });
    assert.equal(plan.length, rounds * 2, `rounds=${rounds}`);
    assert.equal(plan.at(-1)?.kind, "longBreak", `rounds=${rounds}`);
    assert.equal(
      plan.filter((step) => step.kind === "focus").length,
      rounds,
      `rounds=${rounds}`,
    );
  }
});

test("clampSettings pulls out-of-range values back into bounds", () => {
  const clamped = clampSettings({
    focusMinutes: 0,
    shortBreakMinutes: 999,
    longBreakMinutes: -5,
    rounds: 100,
    autoStart: true,
    sound: false,
    notifications: false,
  });

  assert.equal(clamped.focusMinutes, 1);
  assert.equal(clamped.shortBreakMinutes, 60);
  assert.equal(clamped.longBreakMinutes, 1);
  assert.equal(clamped.rounds, 12);
});

test("clampSettings falls back to defaults for non-numeric input", () => {
  // Values recovered from localStorage aren't guaranteed to be sane.
  const clamped = clampSettings({
    focusMinutes: Number.NaN,
    shortBreakMinutes: Number.POSITIVE_INFINITY,
    longBreakMinutes: 25,
    rounds: 3,
    autoStart: true,
    sound: true,
    notifications: false,
  } as Settings);

  assert.equal(clamped.focusMinutes, DEFAULT_SETTINGS.focusMinutes);
  assert.equal(clamped.shortBreakMinutes, DEFAULT_SETTINGS.shortBreakMinutes);
  assert.equal(clamped.rounds, 3);
});

test("clampSettings rounds fractional minutes", () => {
  const clamped = clampSettings({ ...DEFAULT_SETTINGS, focusMinutes: 24.6 });
  assert.equal(clamped.focusMinutes, 25);
});

test("formatClock counts down in mm:ss and rolls into hours", () => {
  assert.equal(formatClock(25 * MINUTE), "25:00");
  assert.equal(formatClock(5 * MINUTE), "05:00");
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(60 * MINUTE), "1:00:00");
});

test("formatClock rounds up, so 00:00 only shows when time is truly up", () => {
  assert.equal(formatClock(1), "00:01");
  assert.equal(formatClock(999), "00:01");
  assert.equal(formatClock(1000), "00:01");
  assert.equal(formatClock(-5000), "00:00");
});

test("formatDuration reads naturally at every scale", () => {
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(45_000), "45s");
  assert.equal(formatDuration(MINUTE), "1m");
  assert.equal(formatDuration(25 * MINUTE), "25m");
  assert.equal(formatDuration(60 * MINUTE), "1h");
  assert.equal(formatDuration(85 * MINUTE), "1h 25m");
});
