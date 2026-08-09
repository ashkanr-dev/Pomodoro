"use client";

import { useCallback, useEffect, useState } from "react";


import { CycleTrack } from "@/components/CycleTrack";
import { SettingsPanel } from "@/components/SettingsPanel";
import { StatsPanel } from "@/components/StatsPanel";
import { TaskPanel } from "@/components/TaskPanel";
import { TimerDial } from "@/components/TimerDial";
import { usePomodoro } from "@/hooks/usePomodoro";
import { useSettings } from "@/hooks/useSettings";
import { createTask, deleteTask, updateTask } from "@/lib/client";
import { refreshData, setDataError, useAppData } from "@/lib/data-store";
import {
  createPersistentStore,
  useIsClient,
  usePersistentStore,
} from "@/lib/persistent-store";
import { PHASE_COPY, PHASE_THEME } from "@/lib/pomodoro";
import type { TaskWithStats } from "@/lib/types";

const activeTaskStore = createPersistentStore<string | null>(
  "pomodoro.activeTask.v1",
  null,
  (raw) => (typeof raw === "string" ? raw : null),
);

export function PomodoroApp() {
  const { settings, update: updateSettings, reset: resetSettings } = useSettings();
  const isClient = useIsClient();

  const { tasks, sessions, stats, loading, error: dataError } = useAppData();
  const [grantedPermission, setGrantedPermission] =
    useState<NotificationPermission | null>(null);

  const storedTaskId = usePersistentStore(activeTaskStore);
  const activeTask = tasks.find((task) => task.id === storedTaskId) ?? null;
  // While tasks are still loading we trust the stored id; afterwards a task
  // that no longer exists simply stops counting as selected.
  const activeTaskId = loading ? storedTaskId : (activeTask?.id ?? null);

  const notificationPermission: NotificationPermission | "unsupported" =
    !isClient || typeof Notification === "undefined"
      ? "unsupported"
      : (grantedPermission ?? Notification.permission);

  const timer = usePomodoro({
    settings,
    activeTaskId,
    onSessionSaved: refreshData,
  });

  const selectTask = useCallback((id: string | null) => {
    activeTaskStore.set(id);
  }, []);

  const runAction = useCallback(async (action: () => Promise<unknown>) => {
    try {
      await action();
      setDataError(null);
    } catch (cause) {
      setDataError(cause instanceof Error ? cause.message : "That action failed.");
    } finally {
      await refreshData();
    }
  }, []);

  const handleCreate = useCallback(
    async (title: string) => {
      await runAction(async () => {
        const task = await createTask(title);
        selectTask(task.id);
      });
    },
    [runAction, selectTask],
  );

  const handleToggleDone = useCallback(
    (task: TaskWithStats) =>
      runAction(() => updateTask(task.id, { done: !task.completedAt })),
    [runAction],
  );

  const handleRename = useCallback(
    (task: TaskWithStats, title: string) =>
      runAction(() => updateTask(task.id, { title })),
    [runAction],
  );

  const handleDelete = useCallback(
    async (task: TaskWithStats) => {
      const confirmed = window.confirm(
        `Delete "${task.title}"? The time already logged stays in your history.`,
      );
      if (!confirmed) return;
      if (task.id === storedTaskId) selectTask(null);
      await runAction(() => deleteTask(task.id));
    },
    [runAction, selectTask, storedTaskId],
  );

  const requestNotifications = useCallback(() => {
    if (typeof Notification === "undefined") return;
    void Notification.requestPermission().then(setGrantedPermission);
  }, []);

  // Space toggles the timer, as long as the user isn't typing.
  const toggleTimer = timer.toggle;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.code !== "Space" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      toggleTimer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleTimer]);

  const theme = PHASE_THEME[timer.step.kind];
  const copy = PHASE_COPY[timer.step.kind];
  const running = timer.status === "running";

  return (
    <div
      className={`min-h-screen bg-slate-950 bg-gradient-to-b ${theme.page} via-slate-950 to-slate-950 transition-colors duration-700`}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Pomodoro Tracker
            </h1>
            <p className="mt-1 max-w-xl text-sm text-white/50">
              Three 25-minute focus rounds, a 5-minute rest between each, then a
              25-minute break. No sign-up — just add a task and start.
            </p>
          </div>
          <p className="text-xs text-white/35">
            Press <kbd className="rounded bg-white/10 px-1.5 py-0.5">Space</kbd>{" "}
            to start or pause
          </p>
        </header>

        {(timer.error ?? dataError) && (
          <div
            role="alert"
            className="flex items-start justify-between gap-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
          >
            <span>{timer.error ?? dataError}</span>
            <button
              type="button"
              onClick={() => {
                timer.dismissError();
                setDataError(null);
              }}
              className="shrink-0 text-amber-200/70 transition hover:text-amber-100"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur sm:p-7">
            <div className="mb-6">
              <CycleTrack
                plan={timer.plan}
                currentIndex={timer.stepIndex}
                progress={timer.progress}
                onSelect={timer.jumpToStep}
              />
            </div>

            <TimerDial
              step={timer.step}
              remainingMs={timer.remainingMs}
              progress={timer.progress}
              running={running}
            />

            <p className="mt-5 text-center text-sm text-white/50">{copy.hint}</p>

            <p className="mt-2 text-center text-sm text-white/70">
              {timer.step.kind === "focus" ? (
                activeTask ? (
                  <>
                    Working on{" "}
                    <span className="font-medium text-white">
                      {activeTask.title}
                    </span>
                  </>
                ) : (
                  <span className="text-white/40">
                    No task selected — pick one to attribute this time
                  </span>
                )
              ) : (
                <>
                  Next up:{" "}
                  <span className="font-medium text-white">
                    {timer.nextStep.label}
                  </span>
                </>
              )}
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={timer.toggle}
                className={`min-w-[9rem] rounded-full px-8 py-3 text-base font-semibold shadow-lg transition ${theme.button}`}
              >
                {running ? "Pause" : timer.elapsedMs > 0 ? "Resume" : "Start"}
              </button>
              <button
                type="button"
                onClick={timer.skip}
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/30 hover:text-white"
              >
                Skip ahead
              </button>
              <button
                type="button"
                onClick={timer.restartStep}
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/30 hover:text-white"
              >
                Restart interval
              </button>
              <button
                type="button"
                onClick={timer.restartCycle}
                className="rounded-full px-4 py-3 text-sm text-white/40 transition hover:text-white/80"
              >
                Restart cycle
              </button>
            </div>
          </section>

          <div className="flex flex-col gap-6">
            <TaskPanel
              tasks={tasks}
              activeTaskId={activeTaskId}
              loading={loading}
              onSelect={selectTask}
              onCreate={handleCreate}
              onToggleDone={handleToggleDone}
              onRename={handleRename}
              onDelete={handleDelete}
            />
            <SettingsPanel
              settings={settings}
              onChange={updateSettings}
              onReset={resetSettings}
              onRequestNotifications={requestNotifications}
              notificationPermission={notificationPermission}
            />
          </div>
        </div>

        <StatsPanel stats={stats} sessions={sessions} />

        <footer className="pb-4 text-center text-xs text-white/30">
          Tasks and intervals are stored on the server, keyed to this browser.
          Clearing site data starts you over.
        </footer>
      </div>
    </div>
  );
}
