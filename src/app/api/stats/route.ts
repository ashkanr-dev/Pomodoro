import type { NextRequest } from "next/server";

import { getUserId } from "@/lib/api";
import { read } from "@/lib/db";
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

  const sessions = await read((db) =>
    db.sessions.filter((session) => session.userId === userId),
  );
  return Response.json({ stats: buildStats(sessions, tzOffsetMinutes) });
}
