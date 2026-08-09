import type { NextRequest } from "next/server";

import { getUserId, jsonError, readJsonBody } from "@/lib/api";
import { mutate, newId, read } from "@/lib/db";
import { withStats } from "@/lib/stats";
import type { Task } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_TITLE_LENGTH = 200;

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  const includeArchived =
    request.nextUrl.searchParams.get("includeArchived") === "true";

  const tasks = await read((db) => {
    const sessions = db.sessions.filter((session) => session.userId === userId);
    return db.tasks
      .filter((task) => task.userId === userId)
      .filter((task) => includeArchived || !task.archived)
      .map((task) => withStats(task, sessions))
      .sort((a, b) => {
        // Open tasks first, newest first within each group.
        if (Boolean(a.completedAt) !== Boolean(b.completedAt)) {
          return a.completedAt ? 1 : -1;
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
  });

  return Response.json({ tasks });
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  const body = await readJsonBody(request);
  if (!body) return jsonError("Expected a JSON object body.", 400);

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return jsonError("A task needs a title.", 400);
  if (title.length > MAX_TITLE_LENGTH) {
    return jsonError(
      `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`,
      400,
    );
  }

  const now = new Date().toISOString();
  const task: Task = {
    id: newId(),
    userId,
    title,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archived: false,
  };

  await mutate((db) => {
    db.tasks.push(task);
  });

  return Response.json({ task: withStats(task, []) }, { status: 201 });
}
