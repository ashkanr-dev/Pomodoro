import type { NextRequest } from "next/server";

import { getUserId, jsonError, readJsonBody } from "@/lib/api";
import { createSession, listSessions } from "@/lib/queries";
import type { PhaseKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const PHASE_KINDS: PhaseKind[] = ["focus", "shortBreak", "longBreak"];
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function toBoundedInt(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > max) return null;
  return rounded;
}

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  const params = request.nextUrl.searchParams;

  const limitParam = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam)
    ? Math.min(MAX_LIMIT, Math.max(1, limitParam))
    : DEFAULT_LIMIT;

  const sessions = await listSessions(userId, {
    taskId: params.get("taskId"),
    limit,
  });
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

  const plannedMs = toBoundedInt(body.plannedMs, MAX_DURATION_MS);
  const durationMs = toBoundedInt(body.durationMs, MAX_DURATION_MS);
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

  const session = await createSession(userId, {
    taskId: typeof body.taskId === "string" ? body.taskId : null,
    kind: kind as PhaseKind,
    stepIndex: toBoundedInt(body.stepIndex, 1000) ?? 0,
    round: toBoundedInt(body.round, 1000) ?? 1,
    plannedMs,
    durationMs,
    startedAt,
    endedAt,
    completed: Boolean(body.completed),
  });

  return Response.json({ session }, { status: 201 });
}
