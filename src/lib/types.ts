/** Shared types for the Pomodoro tracker (used by both the API and the UI). */

/** The three kinds of intervals in a Pomodoro cycle. */
export type PhaseKind = "focus" | "shortBreak" | "longBreak";

export interface Task {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** ISO date when the user ticked the task off, otherwise `null`. */
  completedAt: string | null;
  archived: boolean;
}

/** One finished (or abandoned) interval, always persisted server-side. */
export interface SessionRecord {
  id: string;
  userId: string;
  /** `null` once the linked task has been deleted. */
  taskId: string | null;
  /** Title snapshot so history survives task deletion. */
  taskTitle: string | null;
  kind: PhaseKind;
  /** Position of the interval inside the six-step cycle (0-based). */
  stepIndex: number;
  /** Which focus round the interval belongs to (1-based). */
  round: number;
  /** Duration the interval was configured to run for, in ms. */
  plannedMs: number;
  /** Time actually spent running (paused time excluded), in ms. */
  durationMs: number;
  startedAt: string;
  endedAt: string;
  /** `true` when the interval ran to the end, `false` when skipped/stopped. */
  completed: boolean;
}

export interface TaskWithStats extends Task {
  stats: {
    focusMs: number;
    focusSessions: number;
    completedFocusSessions: number;
    lastActiveAt: string | null;
  };
}

export interface DailyTotal {
  /** `YYYY-MM-DD` in the reporting timezone. */
  date: string;
  focusMs: number;
  focusSessions: number;
}

export interface Stats {
  totals: {
    focusMs: number;
    breakMs: number;
    focusSessions: number;
    completedFocusSessions: number;
    /** Number of full cycles finished (long breaks completed). */
    cyclesCompleted: number;
  };
  today: {
    focusMs: number;
    focusSessions: number;
    completedFocusSessions: number;
  };
  last7Days: DailyTotal[];
  perTask: Array<{
    taskId: string | null;
    taskTitle: string;
    focusMs: number;
    focusSessions: number;
  }>;
}
