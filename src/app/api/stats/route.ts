import type { NextRequest } from "next/server";

import { getUserId } from "@/lib/api";
import { listAllSessions } from "@/lib/queries";
import { buildStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

const MAX_TZ_OFFSET_MINUTES = 14 * 60;

export async function GET(request: NextRequest) {
  const userId = getUserId(request);

  const raw = Number.parseInt(
    request.nextUrl.searchParams.get("tzOffset") ?? "",
    10,
  );
  const tzOffsetMinutes =
    Number.isFinite(raw) && Math.abs(raw) <= MAX_TZ_OFFSET_MINUTES ? raw : 0;

  // Rolled up in process rather than in SQL: the day bucketing depends on the
  // viewer's timezone offset and is already covered by tests. One person's
  // interval history is small enough that this stays cheap.
  const sessions = await listAllSessions(userId);
  return Response.json({ stats: buildStats(sessions, tzOffsetMinutes) });
}
