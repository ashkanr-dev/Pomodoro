"use client";

import { useSyncExternalStore } from "react";

/**
 * A `localStorage`-backed store shaped for `useSyncExternalStore`.
 *
 * Reading `localStorage` during render would break hydration, and reading it
 * in an effect causes a cascading re-render. `useSyncExternalStore` is the
 * pattern React provides for exactly this: it serves the server snapshot while
 * hydrating and swaps to the stored value immediately afterwards. It also
 * gives cross-tab sync via the `storage` event for free.
 */
export interface PersistentStore<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  set: (next: T) => void;
  update: (updater: (current: T) => T) => void;
}

export function createPersistentStore<T>(
  key: string,
  initial: T,
  revive: (raw: unknown) => T,
): PersistentStore<T> {
  let snapshot = initial;
  let loaded = false;
  const listeners = new Set<() => void>();

  function load(): void {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(key);
      snapshot = raw === null ? initial : revive(JSON.parse(raw));
    } catch {
      snapshot = initial;
    }
  }

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function onStorage(event: StorageEvent): void {
    if (event.key !== key) return;
    loaded = false;
    load();
    emit();
  }

  function set(next: T): void {
    load();
    snapshot = next;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage blocked or full: keep the in-memory value.
    }
    emit();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          window.removeEventListener("storage", onStorage);
        }
      };
    },
    getSnapshot() {
      load();
      return snapshot;
    },
    getServerSnapshot() {
      return initial;
    },
    set,
    update(updater) {
      load();
      set(updater(snapshot));
    },
  };
}

export function usePersistentStore<T>(store: PersistentStore<T>): T {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
}

const noopSubscribe = () => () => {};

/** `false` during SSR and the hydration render, `true` afterwards. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
