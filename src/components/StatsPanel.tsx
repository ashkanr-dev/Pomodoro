"use client";

import { formatDuration } from "@/lib/pomodoro";
import type { SessionRecord, Stats } from "@/lib/types";

interface Props {
  stats: Stats | null;
  sessions: SessionRecord[];
}

const KIND_LABEL: Record<SessionRecord["kind"], string> = {
  focus: "Focus",
  shortBreak: "Rest",
  longBreak: "Break",
};

const KIND_DOT: Record<SessionRecord["kind"], string> = {
  focus: "bg-rose-400",
  shortBreak: "bg-sky-400",
  longBreak: "bg-emerald-400",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-white">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-white/40">{hint}</p>}
    </div>
  );
}

export function StatsPanel({ stats, sessions }: Props) {
  const maxDay = stats
    ? Math.max(1, ...stats.last7Days.map((day) => day.focusMs))
    : 1;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-white/60">
        Tracked time
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Today"
          value={formatDuration(stats?.today.focusMs ?? 0)}
          hint={`${stats?.today.focusSessions ?? 0} intervals`}
        />
        <Stat
          label="All time"
          value={formatDuration(stats?.totals.focusMs ?? 0)}
          hint={`${stats?.totals.completedFocusSessions ?? 0} completed`}
        />
        <Stat
          label="Cycles"
          value={String(stats?.totals.cyclesCompleted ?? 0)}
          hint="full 3+1 runs"
        />
        <Stat
          label="Breaks"
          value={formatDuration(stats?.totals.breakMs ?? 0)}
          hint="rest + long break"
        />
      </div>

      <div className="mt-6">
        <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-white/40">
          Last 7 days
        </p>
        <div className="flex items-end gap-2">
          {(stats?.last7Days ?? []).map((day) => {
            const height = Math.round((day.focusMs / maxDay) * 100);
            const weekday = new Date(`${day.date}T12:00:00`).toLocaleDateString(
              undefined,
              { weekday: "short" },
            );
            return (
              <div
                key={day.date}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                {/* A definite height here is what lets the bar's % resolve. */}
                <div className="flex h-24 w-full items-end">
                  <div
                    title={`${day.date}: ${formatDuration(day.focusMs)}`}
                    style={{
                      height: `${day.focusMs > 0 ? Math.max(4, height) : 2}%`,
                    }}
                    className={`w-full rounded-t transition-[height] ${
                      day.focusMs > 0 ? "bg-rose-400/80" : "bg-white/10"
                    }`}
                  />
                </div>
                <span className="text-[10px] text-white/40">{weekday}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-white/40">
          Recent intervals
        </p>
        {sessions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 px-4 py-5 text-center text-sm text-white/40">
            Nothing logged yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center gap-3 py-2 text-sm"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[session.kind]}`}
                  aria-hidden="true"
                />
                <span className="w-14 shrink-0 text-xs text-white/50">
                  {KIND_LABEL[session.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate text-white/80">
                  {session.kind === "focus"
                    ? (session.taskTitle ?? "No task")
                    : "—"}
                </span>
                {!session.completed && (
                  <span className="shrink-0 rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-300/80">
                    partial
                  </span>
                )}
                <span className="shrink-0 font-mono text-xs tabular-nums text-white/60">
                  {formatDuration(session.durationMs)}
                </span>
                <span className="hidden shrink-0 text-xs text-white/30 sm:inline">
                  {new Date(session.endedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
