"use client";

import { PHASE_THEME, type PlanStep } from "@/lib/pomodoro";

interface Props {
  plan: PlanStep[];
  currentIndex: number;
  progress: number;
  onSelect: (index: number) => void;
}

/**
 * The whole cycle at a glance — focus 25 / rest 5 / focus 25 / rest 5 /
 * focus 25 / break 25 — with the active interval filling up as it runs.
 */
export function CycleTrack({ plan, currentIndex, progress, onSelect }: Props) {
  return (
    <div className="flex w-full gap-1.5">
      {plan.map((step) => {
        const isCurrent = step.index === currentIndex;
        const isPast = step.index < currentIndex;
        const fill = isCurrent ? progress * 100 : isPast ? 100 : 0;
        const theme = PHASE_THEME[step.kind];

        return (
          <button
            key={step.index}
            type="button"
            onClick={() => onSelect(step.index)}
            title={`${step.label} · ${Math.round(step.durationMs / 60000)} min`}
            aria-label={`Jump to ${step.label}`}
            aria-current={isCurrent ? "step" : undefined}
            className="group min-w-[2.75rem] flex-1 cursor-pointer text-left focus:outline-none"
            // Widths are proportional to length, so the cycle reads to scale.
            style={{ flexGrow: step.durationMs, flexBasis: 0 }}
          >
            <span className="relative block h-2.5 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10 transition group-hover:bg-white/20 group-focus-visible:ring-2 group-focus-visible:ring-white/60">
              <span
                className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-linear ${
                  step.kind === "focus"
                    ? "bg-rose-400"
                    : step.kind === "shortBreak"
                      ? "bg-sky-400"
                      : "bg-emerald-400"
                }`}
                style={{ width: `${fill}%` }}
              />
            </span>
            <span
              className={`mt-2 block truncate text-[11px] font-medium tracking-wide transition ${
                isCurrent ? theme.text : "text-white/40 group-hover:text-white/70"
              }`}
            >
              {step.label}
            </span>
            <span className="block text-[10px] text-white/30">
              {Math.round(step.durationMs / 60000)}m
            </span>
          </button>
        );
      })}
    </div>
  );
}
