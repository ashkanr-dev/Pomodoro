import type { NextRequest } from "next/server";

import { getUserId, jsonError, readJsonBody } from "@/lib/api";
import { mutate, newId, read } from "@/lib/db";
import type { PhaseKind, SessionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

const PHASE_KINDS: PhaseKind[] = ["focus", "shortBreak", "longBreak"];
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function toPositiveInt(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > max) return null;
  return rounded;
}

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  const params = request.nextUrl.searchParams;
  const taskId = params.get("taskId");
  const limitParam = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam)
    ? Math.min(MAX_LIMIT, Math.max(1, limitParam))
    : DEFAULT_LIMIT;

  const sessions = await read((db) =>
    db.sessions
      .filter((session) => session.userId === userId)
      .filter((session) => (taskId ? session.taskId === taskId : true))
      .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
      .slice(0, limit),
  );

  return Response.json({ sessions });
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  const body = await readJsonBody(request);
  if (!body) return jsonError("Expected a JSON object body.", 400);

  const kind = body.kind;
  if (typeof kind !== "string" || !PHASE_KINDS.includes(kind as PhaseKind)) {
    return jsonError(`kind must be one of: ${PHASE_KINDS.join(", ")}.`, 400);
  }

  const plannedMs = toPositiveInt(body.plannedMs, MAX_DURATION_MS);
  const durationMs = toPositiveInt(body.durationMs, MAX_DURATION_MS);
  if (plannedMs === null || durationMs === null) {
    return jsonError(
      "plannedMs and durationMs must be millisecond counts within a day.",
      400,
    );
  }

  const startedAt = new Date(
    typeof body.startedAt === "string" ? body.startedAt : Number.NaN,
  );
  const endedAt = new Date(
    typeof body.endedAt === "string" ? body.endedAt : Number.NaN,
  );
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return jsonError("startedAt and endedAt must be ISO date strings.", 400);
  }

  const requestedTaskId =
    typeof body.taskId === "string" && body.taskId ? body.taskId : null;

  const session = await mutate((db) => {
    const task = requestedTaskId
      ? (db.tasks.find(
          (candidate) =>
            candidate.id === requestedTaskId && candidate.userId === userId,
        ) ?? null)
      : null;

    const record: SessionRecord = {
      id: newId(),
      userId,
      taskId: task?.id ?? null,
      taskTitle: task?.title ?? null,
      kind: kind as PhaseKind,
      stepIndex: toPositiveInt(body.stepIndex, 1000) ?? 0,
      round: toPositiveInt(body.round, 1000) ?? 1,
      plannedMs,
      durationMs,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      completed: Boolean(body.completed),
    };
    db.sessions.push(record);
    return record;
  });

  return Response.json({ session }, { status: 201 });
}
