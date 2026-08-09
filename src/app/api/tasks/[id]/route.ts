import type { NextRequest } from "next/server";

import { getUserId, jsonError, readJsonBody } from "@/lib/api";
import { mutate, read } from "@/lib/db";
import { withStats } from "@/lib/stats";
import type { Task } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_TITLE_LENGTH = 200;

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]">,
) {
  const { id } = await ctx.params;
  const userId = getUserId(request);

  const task = await read((db) => {
    const found = db.tasks.find(
      (candidate) => candidate.id === id && candidate.userId === userId,
    );
    return found
      ? withStats(
          found,
          db.sessions.filter((session) => session.userId === userId),
        )
      : null;
  });

  if (!task) return jsonError("Task not found.", 404);
  return Response.json({ task });
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]">,
) {
  const { id } = await ctx.params;
  const userId = getUserId(request);
  const body = await readJsonBody(request);
  if (!body) return jsonError("Expected a JSON object body.", 400);

  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return jsonError("A task needs a title.", 400);
    if (title.length > MAX_TITLE_LENGTH) {
      return jsonError(
        `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`,
        400,
      );
    }
  }

  const result = await mutate((db) => {
    const index = db.tasks.findIndex(
      (candidate) => candidate.id === id && candidate.userId === userId,
    );
    if (index === -1) return null;

    const current = db.tasks[index];
    const updated: Task = {
      ...current,
      title:
        typeof body.title === "string" ? body.title.trim() : current.title,
      completedAt:
        body.done === undefined
          ? current.completedAt
          : body.done
            ? (current.completedAt ?? new Date().toISOString())
            : null,
      archived:
        body.archived === undefined
          ? current.archived
          : Boolean(body.archived),
      updatedAt: new Date().toISOString(),
    };
    db.tasks[index] = updated;
    return withStats(
      updated,
      db.sessions.filter((session) => session.userId === userId),
    );
  });

  if (!result) return jsonError("Task not found.", 404);
  return Response.json({ task: result });
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]">,
) {
  const { id } = await ctx.params;
  const userId = getUserId(request);

  const deleted = await mutate((db) => {
    const index = db.tasks.findIndex(
      (candidate) => candidate.id === id && candidate.userId === userId,
    );
    if (index === -1) return false;

    db.tasks.splice(index, 1);
    // Keep the history: detach the sessions but hold on to the title snapshot
    // so past focus time still shows up in the stats.
    db.sessions = db.sessions.map((session) =>
      session.taskId === id && session.userId === userId
        ? { ...session, taskId: null }
        : session,
    );
    return true;
  });

  if (!deleted) return jsonError("Task not found.", 404);
  return new Response(null, { status: 204 });
}
