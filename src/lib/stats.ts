import type { DailyTotal, SessionRecord, Stats } from "./types";

const DAY_MS = 86_400_000;

/**
 * `YYYY-MM-DD` for the given instant, offset by `tzOffsetMinutes` (the value
 * of `Date.prototype.getTimezoneOffset()` in the viewer's browser) so "today"
 * means the user's today, not the server's.
 */
export function dayKey(date: Date, tzOffsetMinutes = 0): string {
  const shifted = new Date(date.getTime() - tzOffsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function buildStats(
  sessions: SessionRecord[],
  tzOffsetMinutes = 0,
  now = new Date(),
): Stats {
  const focusSessions = sessions.filter((session) => session.kind === "focus");
  const breakSessions = sessions.filter((session) => session.kind !== "focus");

  const keyOf = (session: SessionRecord) =>
    dayKey(new Date(session.endedAt), tzOffsetMinutes);

  const byDay = new Map<string, SessionRecord[]>();
  for (const session of focusSessions) {
    const key = keyOf(session);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(session);
    else byDay.set(key, [session]);
  }

  const last7Days: DailyTotal[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const key = dayKey(
      new Date(now.getTime() - offset * DAY_MS),
      tzOffsetMinutes,
    );
    const daySessions = byDay.get(key) ?? [];
    last7Days.push({
      date: key,
      focusMs: daySessions.reduce((total, s) => total + s.durationMs, 0),
      focusSessions: daySessions.length,
    });
  }

  const todaySessions = byDay.get(dayKey(now, tzOffsetMinutes)) ?? [];

  const byTask = new Map<
    string,
    { taskTitle: string; focusMs: number; focusSessions: number }
  >();
  for (const session of focusSessions) {
    const key = session.taskId ?? "__none__";
    const entry = byTask.get(key) ?? {
      taskTitle: session.taskTitle ?? "Unassigned",
      focusMs: 0,
      focusSessions: 0,
    };
    entry.focusMs += session.durationMs;
    entry.focusSessions += 1;
    byTask.set(key, entry);
  }

  return {
    totals: {
      focusMs: focusSessions.reduce((total, s) => total + s.durationMs, 0),
      breakMs: breakSessions.reduce((total, s) => total + s.durationMs, 0),
      focusSessions: focusSessions.length,
      completedFocusSessions: focusSessions.filter((s) => s.completed).length,
      cyclesCompleted: sessions.filter(
        (session) => session.kind === "longBreak" && session.completed,
      ).length,
    },
    today: {
      focusMs: todaySessions.reduce((total, s) => total + s.durationMs, 0),
      focusSessions: todaySessions.length,
      completedFocusSessions: todaySessions.filter((s) => s.completed).length,
    },
    last7Days,
    perTask: [...byTask.entries()]
      .map(([taskId, entry]) => ({
        taskId: taskId === "__none__" ? null : taskId,
        ...entry,
      }))
      .sort((a, b) => b.focusMs - a.focusMs),
  };
}
