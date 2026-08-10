import type { NextRequest } from "next/server";

import { getUserId, jsonError, readJsonBody } from "@/lib/api";
import { deleteTask, getTask, updateTask } from "@/lib/queries";

export const dynamic = "force-dynamic";

const MAX_TITLE_LENGTH = 200;

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]">,
) {
  const { id } = await ctx.params;
  const task = await getTask(getUserId(request), id);

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

  let title: string | undefined;
  if (body.title !== undefined) {
    title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return jsonError("A task needs a title.", 400);
    if (title.length > MAX_TITLE_LENGTH) {
      return jsonError(
        `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`,
        400,
      );
    }
  }

  const task = await updateTask(userId, id, {
    title,
    done: body.done === undefined ? undefined : Boolean(body.done),
    archived: body.archived === undefined ? undefined : Boolean(body.archived),
  });

  if (!task) return jsonError("Task not found.", 404);
  return Response.json({ task });
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]">,
) {
  const { id } = await ctx.params;
  // Sessions survive: the foreign key nulls the link and keeps the snapshot.
  const deleted = await deleteTask(getUserId(request), id);

  if (!deleted) return jsonError("Task not found.", 404);
  return new Response(null, { status: 204 });
}
