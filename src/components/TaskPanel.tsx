"use client";

import { useState } from "react";

import { formatDuration } from "@/lib/pomodoro";
import type { TaskWithStats } from "@/lib/types";

interface Props {
  tasks: TaskWithStats[];
  activeTaskId: string | null;
  loading: boolean;
  onSelect: (id: string | null) => void;
  onCreate: (title: string) => Promise<void>;
  onToggleDone: (task: TaskWithStats) => Promise<void>;
  onRename: (task: TaskWithStats, title: string) => Promise<void>;
  onDelete: (task: TaskWithStats) => Promise<void>;
}

export function TaskPanel({
  tasks,
  activeTaskId,
  loading,
  onSelect,
  onCreate,
  onToggleDone,
  onRename,
  onDelete,
}: Props) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!title || submitting) return;
    setSubmitting(true);
    try {
      await onCreate(title);
      setDraft("");
    } finally {
      setSubmitting(false);
    }
  }

  async function commitRename(task: TaskWithStats) {
    const title = editDraft.trim();
    setEditingId(null);
    if (title && title !== task.title) await onRename(task, title);
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/60">
          Tasks
        </h2>
        <span className="text-xs text-white/40">
          {tasks.filter((task) => !task.completedAt).length} open
        </span>
      </header>

      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={200}
          placeholder="What are you working on?"
          aria-label="New task"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
        />
        <button
          type="submit"
          disabled={!draft.trim() || submitting}
          className="rounded-lg bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {loading && tasks.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
          No tasks yet. Add one above, then hit start — every focus interval is
          logged against the task you picked.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => {
            const isActive = task.id === activeTaskId;
            const isDone = Boolean(task.completedAt);
            return (
              <li
                key={task.id}
                className={`group rounded-xl border px-3 py-2.5 transition ${
                  isActive
                    ? "border-rose-400/40 bg-rose-500/10"
                    : "border-white/10 bg-black/20 hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => void onToggleDone(task)}
                    aria-label={`Mark "${task.title}" as ${isDone ? "not done" : "done"}`}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-400"
                  />

                  {editingId === task.id ? (
                    <input
                      autoFocus
                      value={editDraft}
                      maxLength={200}
                      onChange={(event) => setEditDraft(event.target.value)}
                      onBlur={() => void commitRename(task)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void commitRename(task);
                        if (event.key === "Escape") setEditingId(null);
                      }}
                      aria-label="Task title"
                      className="min-w-0 flex-1 rounded border border-white/20 bg-black/40 px-2 py-1 text-sm text-white focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelect(isActive ? null : task.id)}
                      onDoubleClick={() => {
                        setEditingId(task.id);
                        setEditDraft(task.title);
                      }}
                      title="Click to focus this task, double-click to rename"
                      className="min-w-0 flex-1 truncate text-left text-sm text-white/90"
                    >
                      <span className={isDone ? "text-white/40 line-through" : ""}>
                        {task.title}
                      </span>
                    </button>
                  )}

                  <span
                    className="shrink-0 font-mono text-xs tabular-nums text-white/50"
                    title={`${task.stats.completedFocusSessions} completed focus intervals`}
                  >
                    {formatDuration(task.stats.focusMs)}
                  </span>

                  <button
                    type="button"
                    onClick={() => void onDelete(task)}
                    aria-label={`Delete "${task.title}"`}
                    className="shrink-0 rounded p-1 text-white/25 opacity-0 transition hover:bg-white/10 hover:text-white/80 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="M8.5 2a1 1 0 0 0-1 1V4H4.5a.75.75 0 0 0 0 1.5h.6l.7 9.2A2 2 0 0 0 7.8 16.6h4.4a2 2 0 0 0 2-1.9l.7-9.2h.6a.75.75 0 0 0 0-1.5H12.5V3a1 1 0 0 0-1-1h-3Zm.5 2V3.5h2V4h-2Zm-.6 3.25a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0v-5a.75.75 0 0 1 .75-.75Zm3.2 0a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0v-5a.75.75 0 0 1 .75-.75Z" />
                    </svg>
                  </button>
                </div>

                {isActive && (
                  <p className="mt-1.5 pl-7 text-[11px] font-medium uppercase tracking-wider text-rose-300/80">
                    Focus intervals count towards this task
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {activeTaskId && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="mt-3 text-xs text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
        >
          Track without a task
        </button>
      )}
    </section>
  );
}
