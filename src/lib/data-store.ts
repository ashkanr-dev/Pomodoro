"use client";

import { useSyncExternalStore } from "react";

import { fetchSessions, fetchStats, fetchTasks } from "./client";
import type { SessionRecord, Stats, TaskWithStats } from "./types";

/**
 * Everything the API owns — tasks, logged intervals and the aggregates — in
 * one external store. The first subscriber kicks off the initial load, and
 * `refreshData()` re-syncs after a mutation or a finished interval.
 */
export interface AppData {
  tasks: TaskWithStats[];
  sessions: SessionRecord[];
  stats: Stats | null;
  loading: boolean;
  error: string | null;
}

const RECENT_SESSION_COUNT = 12;

const EMPTY: AppData = {
  tasks: [],
  sessions: [],
  stats: null,
  loading: true,
  error: null,
};

let snapshot: AppData = EMPTY;
let started = false;
const listeners = new Set<() => void>();

function emit(next: AppData): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

async function load(): Promise<void> {
  try {
    const [tasks, sessions, stats] = await Promise.all([
      fetchTasks(),
      fetchSessions(RECENT_SESSION_COUNT),
      fetchStats(),
    ]);
    emit({ tasks, sessions, stats, loading: false, error: null });
  } catch (cause) {
    emit({
      ...snapshot,
      loading: false,
      error:
        cause instanceof Error ? cause.message : "Could not reach the server.",
    });
  }
}

// Serialised so a refresh requested during another one still sees the newer
// server state, rather than being swallowed by the in-flight request.
let chain: Promise<void> = Promise.resolve();

export function refreshData(): Promise<void> {
  chain = chain.then(load, load);
  return chain;
}

export function setDataError(error: string | null): void {
  if (snapshot.error === error) return;
  emit({ ...snapshot, error });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    void refreshData();
  }
  return () => {
    listeners.delete(listener);
  };
}

export function useAppData(): AppData {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}
