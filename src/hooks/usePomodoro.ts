"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { playChime, primeAudio } from "@/lib/chime";
import { recordSession } from "@/lib/client";
import {
  createPersistentStore,
  useIsClient,
  usePersistentStore,
} from "@/lib/persistent-store";
import {
  buildPlan,
  PHASE_COPY,
  type PlanStep,
  type Settings,
} from "@/lib/pomodoro";

const TICK_MS = 250;
/** Below this, an abandoned interval isn't worth writing to history. */
const MIN_RECORDED_MS = 5_000;

export type TimerStatus = "idle" | "running" | "paused";

interface TimerState {
  stepIndex: number;
  status: TimerStatus;
  /** Epoch ms the current running stretch began, or `null` while stopped. */
  runningSince: number | null;
  /** Milliseconds banked from earlier running stretches of this step. */
  accumulatedMs: number;
  /** Epoch ms this step was first started. */
  stepStartedAt: number | null;
  /** Task the running interval is credited to, fixed when the step starts. */
  taskId: string | null;
}

const INITIAL_STATE: TimerState = {
  stepIndex: 0,
  status: "idle",
  runningSince: null,
  accumulatedMs: 0,
  stepStartedAt: null,
  taskId: null,
};

/**
 * The timer survives reloads: everything is derived from timestamps, so a
 * countdown that was running when the tab closed keeps counting down.
 */
const timerStore = createPersistentStore<TimerState>(
  "pomodoro.timer.v1",
  INITIAL_STATE,
  (raw) => {
    const parsed =
      typeof raw === "object" && raw !== null ? (raw as Partial<TimerState>) : {};
    return {
      ...INITIAL_STATE,
      ...parsed,
      stepIndex: Number.isInteger(parsed.stepIndex) ? Number(parsed.stepIndex) : 0,
    };
  },
);

function elapsedOf(state: TimerState, now: number): number {
  return (
    state.accumulatedMs +
    (state.runningSince === null ? 0 : Math.max(0, now - state.runningSince))
  );
}

function notify(step: PlanStep, nextStep: PlanStep): void {
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return;
  }
  try {
    new Notification(`${step.label} done`, {
      body: `Up next: ${nextStep.label} · ${Math.round(nextStep.durationMs / 60000)} min`,
      tag: "pomodoro-phase",
    });
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}

interface Options {
  settings: Settings;
  activeTaskId: string | null;
  onSessionSaved?: () => void;
}

export function usePomodoro({ settings, activeTaskId, onSessionSaved }: Options) {
  const plan = useMemo(() => buildPlan(settings), [settings]);

  const state = usePersistentStore(timerStore);
  const hydrated = useIsClient();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  /** Guards a step against being written to history twice. */
  const finishedRef = useRef<string | null>(null);
  const onSessionSavedRef = useRef(onSessionSaved);
  useEffect(() => {
    onSessionSavedRef.current = onSessionSaved;
  }, [onSessionSaved]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    // Waking a backgrounded tab should re-sync the clock immediately.
    const onVisible = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const stepIndex = Math.min(Math.max(0, state.stepIndex), plan.length - 1);
  const step = plan[stepIndex];
  const nextStep = plan[(stepIndex + 1) % plan.length];
  const rawElapsed = elapsedOf(state, now);
  const elapsedMs = Math.min(rawElapsed, step.durationMs);
  const remainingMs = Math.max(0, step.durationMs - rawElapsed);
  const progress = step.durationMs === 0 ? 0 : elapsedMs / step.durationMs;

  const save = useCallback(
    async (params: {
      step: PlanStep;
      startedAt: number;
      endedAt: number;
      durationMs: number;
      completed: boolean;
      taskId: string | null;
    }) => {
      try {
        await recordSession({
          taskId: params.step.kind === "focus" ? params.taskId : null,
          kind: params.step.kind,
          stepIndex: params.step.index,
          round: params.step.round,
          plannedMs: params.step.durationMs,
          durationMs: Math.round(params.durationMs),
          startedAt: new Date(params.startedAt).toISOString(),
          endedAt: new Date(params.endedAt).toISOString(),
          completed: params.completed,
        });
        setError(null);
        onSessionSavedRef.current?.();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? `Could not save that interval: ${cause.message}`
            : "Could not save that interval.",
        );
      }
    },
    [],
  );

  /** Writes the current interval to history if it's worth keeping. */
  const bankCurrentStep = useCallback(
    (endedAt: number, completed: boolean) => {
      if (state.stepStartedAt === null) return;
      const durationMs = completed
        ? step.durationMs
        : Math.min(elapsedOf(state, endedAt), step.durationMs);
      if (durationMs < MIN_RECORDED_MS) return;
      void save({
        step,
        startedAt: state.stepStartedAt,
        endedAt,
        durationMs,
        completed,
        taskId: state.taskId ?? activeTaskId,
      });
    },
    [activeTaskId, save, state, step],
  );

  /**
   * Ends the current interval and moves to the next one. `endedAt` lets a
   * restored timer credit the exact instant the countdown hit zero.
   */
  const finishStep = useCallback(
    (options: { completed: boolean; endedAt: number; autoStart: boolean }) => {
      const key = `${stepIndex}:${state.stepStartedAt ?? 0}`;
      if (finishedRef.current === key) return;
      finishedRef.current = key;

      bankCurrentStep(options.endedAt, options.completed);

      const startAt = Date.now();
      const nextIndex = (stepIndex + 1) % plan.length;
      timerStore.update((current) => ({
        ...current,
        stepIndex: nextIndex,
        status: options.autoStart ? "running" : "idle",
        runningSince: options.autoStart ? startAt : null,
        accumulatedMs: 0,
        stepStartedAt: options.autoStart ? startAt : null,
      }));
    },
    [bankCurrentStep, plan.length, state.stepStartedAt, stepIndex],
  );

  // Fires when the countdown reaches zero — including time that passed while
  // the tab was closed, which `elapsedOf` accounts for on restore.
  useEffect(() => {
    if (!hydrated || state.status !== "running" || state.stepStartedAt === null) {
      return;
    }
    const overshoot = elapsedOf(state, now) - step.durationMs;
    if (overshoot < 0) return;

    const endedAt =
      state.runningSince === null
        ? now
        : state.runningSince + (step.durationMs - state.accumulatedMs);
    // If the browser was away long enough to blow through the whole interval,
    // don't chain-start the next one — credit this one and wait for the user.
    const wasAway = overshoot > 2 * TICK_MS;

    if (!wasAway) {
      if (settings.sound) playChime(nextStep.kind);
      if (settings.notifications) notify(step, nextStep);
    }

    finishStep({
      completed: true,
      endedAt,
      autoStart: settings.autoStart && !wasAway,
    });
  }, [now, hydrated, state, step, nextStep, settings, finishStep]);

  const start = useCallback(() => {
    primeAudio();
    const at = Date.now();
    timerStore.update((current) =>
      current.status === "running"
        ? current
        : {
            ...current,
            status: "running",
            runningSince: at,
            stepStartedAt: current.stepStartedAt ?? at,
            // Lock the task in when the interval begins.
            taskId: current.stepStartedAt === null ? activeTaskId : current.taskId,
          },
    );
  }, [activeTaskId]);

  const pause = useCallback(() => {
    const at = Date.now();
    timerStore.update((current) =>
      current.status !== "running" || current.runningSince === null
        ? current
        : {
            ...current,
            status: "paused",
            accumulatedMs: current.accumulatedMs + (at - current.runningSince),
            runningSince: null,
          },
    );
  }, []);

  const toggle = useCallback(() => {
    if (state.status === "running") pause();
    else start();
  }, [pause, start, state.status]);

  /** Ends the interval early and moves on, keeping the time already spent. */
  const skip = useCallback(() => {
    finishStep({ completed: false, endedAt: Date.now(), autoStart: false });
  }, [finishStep]);

  /** Restarts the current interval, banking any time already spent. */
  const restartStep = useCallback(() => {
    bankCurrentStep(Date.now(), false);
    finishedRef.current = null;
    timerStore.update((current) => ({
      ...current,
      status: "idle",
      runningSince: null,
      accumulatedMs: 0,
      stepStartedAt: null,
    }));
  }, [bankCurrentStep]);

  /** Drops back to the first focus interval of a fresh cycle. */
  const restartCycle = useCallback(() => {
    bankCurrentStep(Date.now(), false);
    finishedRef.current = null;
    timerStore.update((current) => ({ ...INITIAL_STATE, taskId: current.taskId }));
  }, [bankCurrentStep]);

  /** Jumps straight to another interval of the cycle without logging time. */
  const jumpToStep = useCallback(
    (index: number) => {
      if (index === stepIndex) return;
      finishedRef.current = null;
      timerStore.update((current) => ({
        ...current,
        stepIndex: Math.max(0, Math.min(index, plan.length - 1)),
        status: "idle",
        runningSince: null,
        accumulatedMs: 0,
        stepStartedAt: null,
      }));
    },
    [plan.length, stepIndex],
  );

  // Keep the tab title in sync so the countdown is readable while pinned.
  useEffect(() => {
    const base = "Pomodoro Tracker";
    if (state.status === "idle" && elapsedMs === 0) {
      document.title = base;
      return;
    }
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    const clock = `${minutes}:${String(seconds).padStart(2, "0")}`;
    const marker = state.status === "running" ? "" : "⏸ ";
    document.title = `${marker}${clock} · ${PHASE_COPY[step.kind].badge}`;
    return () => {
      document.title = base;
    };
  }, [elapsedMs, remainingMs, state.status, step.kind]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    plan,
    step,
    nextStep,
    stepIndex,
    status: state.status,
    remainingMs,
    elapsedMs,
    progress,
    hydrated,
    error,
    dismissError,
    start,
    pause,
    toggle,
    skip,
    restartStep,
    restartCycle,
    jumpToStep,
  };
}
