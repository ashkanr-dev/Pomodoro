import type { PhaseKind } from "./types";

/**
 * The method this app implements:
 *   focus 25' → rest 5' → focus 25' → rest 5' → focus 25' → break 25'
 * i.e. `rounds` focus intervals separated by short rests, then one long break.
 */
export interface Settings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** Focus intervals per cycle. */
  rounds: number;
  /** Start the next interval automatically when one ends. */
  autoStart: boolean;
  sound: boolean;
  notifications: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 25,
  rounds: 3,
  autoStart: true,
  sound: true,
  notifications: false,
};

export const SETTINGS_LIMITS = {
  focusMinutes: { min: 1, max: 180 },
  shortBreakMinutes: { min: 1, max: 60 },
  longBreakMinutes: { min: 1, max: 120 },
  rounds: { min: 1, max: 12 },
} as const;

export interface PlanStep {
  index: number;
  kind: PhaseKind;
  /** 1-based focus round this step belongs to. */
  round: number;
  durationMs: number;
  label: string;
}

const MINUTE_MS = 60_000;

export function clampSettings(settings: Settings): Settings {
  const clamp = (value: number, key: keyof typeof SETTINGS_LIMITS) => {
    const { min, max } = SETTINGS_LIMITS[key];
    if (!Number.isFinite(value)) return DEFAULT_SETTINGS[key];
    return Math.min(max, Math.max(min, Math.round(value)));
  };
  return {
    focusMinutes: clamp(settings.focusMinutes, "focusMinutes"),
    shortBreakMinutes: clamp(settings.shortBreakMinutes, "shortBreakMinutes"),
    longBreakMinutes: clamp(settings.longBreakMinutes, "longBreakMinutes"),
    rounds: clamp(settings.rounds, "rounds"),
    autoStart: Boolean(settings.autoStart),
    sound: Boolean(settings.sound),
    notifications: Boolean(settings.notifications),
  };
}

/** Expands the settings into the ordered list of intervals in one cycle. */
export function buildPlan(settings: Settings): PlanStep[] {
  const steps: PlanStep[] = [];
  for (let round = 1; round <= settings.rounds; round += 1) {
    steps.push({
      index: steps.length,
      kind: "focus",
      round,
      durationMs: settings.focusMinutes * MINUTE_MS,
      label: `Focus ${round}`,
    });
    if (round < settings.rounds) {
      steps.push({
        index: steps.length,
        kind: "shortBreak",
        round,
        durationMs: settings.shortBreakMinutes * MINUTE_MS,
        label: "Short rest",
      });
    }
  }
  steps.push({
    index: steps.length,
    kind: "longBreak",
    round: settings.rounds,
    durationMs: settings.longBreakMinutes * MINUTE_MS,
    label: "Long break",
  });
  return steps;
}

export function cycleDurationMs(settings: Settings): number {
  return buildPlan(settings).reduce((total, step) => total + step.durationMs, 0);
}

export const PHASE_COPY: Record<
  PhaseKind,
  { title: string; hint: string; badge: string }
> = {
  focus: {
    title: "Focus",
    hint: "One task, no tab-hopping. The timer keeps the score.",
    badge: "Focus",
  },
  shortBreak: {
    title: "Short rest",
    hint: "Stand up, look away from the screen, breathe.",
    badge: "Rest",
  },
  longBreak: {
    title: "Long break",
    hint: "Cycle done. Take a proper break before the next one.",
    badge: "Break",
  },
};

/** Tailwind class fragments per phase, so the whole UI shifts colour together. */
export const PHASE_THEME: Record<
  PhaseKind,
  {
    ring: string;
    text: string;
    glow: string;
    chip: string;
    button: string;
    page: string;
  }
> = {
  focus: {
    ring: "stroke-rose-400",
    text: "text-rose-300",
    glow: "shadow-[0_0_120px_-30px_rgba(251,113,133,0.65)]",
    chip: "bg-rose-500/15 text-rose-200 ring-rose-400/30",
    button: "bg-rose-500 hover:bg-rose-400 text-white",
    page: "from-rose-950/60",
  },
  shortBreak: {
    ring: "stroke-sky-400",
    text: "text-sky-300",
    glow: "shadow-[0_0_120px_-30px_rgba(56,189,248,0.6)]",
    chip: "bg-sky-500/15 text-sky-200 ring-sky-400/30",
    button: "bg-sky-500 hover:bg-sky-400 text-white",
    page: "from-sky-950/60",
  },
  longBreak: {
    ring: "stroke-emerald-400",
    text: "text-emerald-300",
    glow: "shadow-[0_0_120px_-30px_rgba(52,211,153,0.6)]",
    chip: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30",
    button: "bg-emerald-500 hover:bg-emerald-400 text-white",
    page: "from-emerald-950/60",
  },
};

/** `mm:ss`, or `h:mm:ss` past an hour. Always rounds up so 0:00 means done. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/** Human duration for stats, e.g. `1h 25m` or `12m` or `45s`. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / MINUTE_MS);
  if (totalMinutes < 1) {
    const seconds = Math.floor(ms / 1000);
    return seconds > 0 ? `${seconds}s` : "0m";
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
