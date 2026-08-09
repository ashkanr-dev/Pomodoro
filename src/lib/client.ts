"use client";

import { USER_HEADER } from "./api";
import type { SessionRecord, Stats, TaskWithStats } from "./types";

const USER_ID_KEY = "pomodoro.userId.v1";

/**
 * There is no login. Each browser generates a random id on first visit and
 * sends it with every request, which keeps separate visitors' data apart on a
 * shared deployment while still requiring zero setup from the user.
 */
export function getBrowserUserId(): string {
  if (typeof window === "undefined") return "anonymous";
  const existing = window.localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;
  const created =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2).padEnd(16, "0");
  window.localStorage.setItem(USER_ID_KEY, created);
  return created;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      [USER_HEADER]: getBrowserUserId(),
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the status-code message.
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function fetchTasks(): Promise<TaskWithStats[]> {
  return request<{ tasks: TaskWithStats[] }>("/api/tasks").then(
    (data) => data.tasks,
  );
}

export function createTask(title: string): Promise<TaskWithStats> {
  return request<{ task: TaskWithStats }>("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title }),
  }).then((data) => data.task);
}

export function updateTask(
  id: string,
  patch: { title?: string; done?: boolean; archived?: boolean },
): Promise<TaskWithStats> {
  return request<{ task: TaskWithStats }>(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  }).then((data) => data.task);
}

export function deleteTask(id: string): Promise<void> {
  return request<void>(`/api/tasks/${id}`, { method: "DELETE" });
}

export type NewSession = Omit<
  SessionRecord,
  "id" | "userId" | "taskTitle" | "taskId"
> & { taskId: string | null };

export function recordSession(session: NewSession): Promise<SessionRecord> {
  return request<{ session: SessionRecord }>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(session),
  }).then((data) => data.session);
}

export function fetchSessions(limit = 12): Promise<SessionRecord[]> {
  return request<{ sessions: SessionRecord[] }>(
    `/api/sessions?limit=${limit}`,
  ).then((data) => data.sessions);
}

export function fetchStats(): Promise<Stats> {
  const tzOffset = new Date().getTimezoneOffset();
  return request<{ stats: Stats }>(`/api/stats?tzOffset=${tzOffset}`).then(
    (data) => data.stats,
  );
}
