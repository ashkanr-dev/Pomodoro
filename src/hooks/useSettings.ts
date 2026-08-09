"use client";

import { useCallback } from "react";

import {
  createPersistentStore,
  usePersistentStore,
} from "@/lib/persistent-store";
import { clampSettings, DEFAULT_SETTINGS, type Settings } from "@/lib/pomodoro";

const settingsStore = createPersistentStore<Settings>(
  "pomodoro.settings.v1",
  DEFAULT_SETTINGS,
  (raw) =>
    clampSettings({
      ...DEFAULT_SETTINGS,
      ...(typeof raw === "object" && raw !== null ? (raw as Partial<Settings>) : {}),
    }),
);

/** Settings live in localStorage: no account, no server round-trip. */
export function useSettings() {
  const settings = usePersistentStore(settingsStore);

  const update = useCallback((patch: Partial<Settings>) => {
    settingsStore.update((current) => clampSettings({ ...current, ...patch }));
  }, []);

  const reset = useCallback(() => {
    settingsStore.set(DEFAULT_SETTINGS);
  }, []);

  return { settings, update, reset };
}
