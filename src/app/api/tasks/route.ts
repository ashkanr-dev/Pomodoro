import type { NextRequest } from "next/server";

import { getUserId, jsonError, readJsonBody } from "@/lib/api";
import { createTask, listTasks } from "@/lib/queries";

export const dynamic = "force-dynamic";

const MAX_TITLE_LENGTH = 200;

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  const includeArchived =
    request.nextUrl.searchParams.get("includeArchived") === "true";

  const tasks = await listTasks(userId, includeArchived);
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

  const task = await createTask(userId, title);
  return Response.json({ task }, { status: 201 });
}
