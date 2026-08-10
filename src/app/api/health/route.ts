import { checkDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe.
 *
 * It runs a real query through the schema bootstrap rather than returning a
 * bare 200, so a missing `DATABASE_URL`, an unreachable database, or one the
 * app can't create its tables in all surface here instead of as a 500 the
 * first time someone tries to save a task.
 */
export async function GET() {
  try {
    const counts = await checkDatabase();
    return Response.json({ status: "ok", ...counts });
  } catch (cause) {
    return Response.json(
      {
        status: "error",
        error: cause instanceof Error ? cause.message : "database unavailable",
      },
      { status: 503 },
    );
  }
}
