"use client";

import { formatClock, PHASE_COPY, PHASE_THEME, type PlanStep } from "@/lib/pomodoro";

interface Props {
  step: PlanStep;
  remainingMs: number;
  progress: number;
  running: boolean;
}

const RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TimerDial({ step, remainingMs, progress, running }: Props) {
  const theme = PHASE_THEME[step.kind];
  const copy = PHASE_COPY[step.kind];

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[19rem]">
      {/* Kept circular and behind the ring so the glow doesn't read as a box. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-8 rounded-full ${theme.glow} transition-shadow duration-700`}
      />
      <svg viewBox="0 0 200 200" className="relative h-full w-full -rotate-90">
        <circle
          cx="100"
          cy="100"
          r={RADIUS}
          fill="none"
          strokeWidth="10"
          className="stroke-white/10"
        />
        <circle
          cx="100"
          cy="100"
          r={RADIUS}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)))}
          className={`${theme.ring} transition-[stroke-dashoffset] duration-300 ease-linear`}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ring-1 ${theme.chip}`}
        >
          {copy.badge}
        </span>
        <span
          className="font-mono text-6xl font-semibold tabular-nums text-white sm:text-7xl"
          aria-live="off"
        >
          {formatClock(remainingMs)}
        </span>
        <span className="text-sm text-white/50">
          {step.label}
          {running ? "" : " · paused"}
        </span>
      </div>
    </div>
  );
}
