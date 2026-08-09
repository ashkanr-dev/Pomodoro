"use client";

import {
  cycleDurationMs,
  formatDuration,
  SETTINGS_LIMITS,
  type Settings,
} from "@/lib/pomodoro";

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
  onRequestNotifications: () => void;
  notificationPermission: NotificationPermission | "unsupported";
}

function NumberField({
  label,
  value,
  limits,
  onChange,
}: {
  label: string;
  value: number;
  limits: { min: number; max: number };
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-[0.14em] text-white/40">
        {label}
      </span>
      <input
        type="number"
        min={limits.min}
        max={limits.max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm tabular-nums text-white focus:border-white/30 focus:outline-none"
      />
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-rose-400"
      />
      <span>
        <span className="block text-sm text-white/80">{label}</span>
        {hint && <span className="block text-xs text-white/40">{hint}</span>}
      </span>
    </label>
  );
}

export function SettingsPanel({
  settings,
  onChange,
  onReset,
  onRequestNotifications,
  notificationPermission,
}: Props) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/60">
          Cycle
        </h2>
        <span className="text-xs text-white/40">
          {formatDuration(cycleDurationMs(settings))} total
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Focus (min)"
          value={settings.focusMinutes}
          limits={SETTINGS_LIMITS.focusMinutes}
          onChange={(value) => onChange({ focusMinutes: value })}
        />
        <NumberField
          label="Short rest (min)"
          value={settings.shortBreakMinutes}
          limits={SETTINGS_LIMITS.shortBreakMinutes}
          onChange={(value) => onChange({ shortBreakMinutes: value })}
        />
        <NumberField
          label="Long break (min)"
          value={settings.longBreakMinutes}
          limits={SETTINGS_LIMITS.longBreakMinutes}
          onChange={(value) => onChange({ longBreakMinutes: value })}
        />
        <NumberField
          label="Focus rounds"
          value={settings.rounds}
          limits={SETTINGS_LIMITS.rounds}
          onChange={(value) => onChange({ rounds: value })}
        />
      </div>

      <div className="mt-4 border-t border-white/10 pt-3">
        <Toggle
          label="Auto-start next interval"
          hint="Rolls straight from focus into rest and back."
          checked={settings.autoStart}
          onChange={(checked) => onChange({ autoStart: checked })}
        />
        <Toggle
          label="Chime on phase change"
          checked={settings.sound}
          onChange={(checked) => onChange({ sound: checked })}
        />
        <Toggle
          label="Desktop notifications"
          hint={
            notificationPermission === "unsupported"
              ? "Not supported in this browser."
              : notificationPermission === "denied"
                ? "Blocked — enable them in your browser settings."
                : notificationPermission === "granted"
                  ? "Allowed."
                  : "You'll be asked for permission."
          }
          checked={settings.notifications && notificationPermission === "granted"}
          onChange={(checked) => {
            onChange({ notifications: checked });
            if (checked) onRequestNotifications();
          }}
        />
      </div>

      <button
        type="button"
        onClick={onReset}
        className="mt-3 text-xs text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
      >
        Reset to 25 / 5 / 25 × 3
      </button>
    </section>
  );
}
