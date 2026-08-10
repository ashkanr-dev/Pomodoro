import { checkWritable, read } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for the host platform.
 *
 * It proves the data volume is actually writable rather than just returning
 * 200, because the most likely way this app breaks in production is a missing
 * or read-only volume — and that failure otherwise looks exactly like a fresh
 * install right up until someone's tasks vanish on redeploy.
 */
export async function GET() {
  try {
    await checkWritable();
    const counts = await read((db) => ({
      tasks: db.tasks.length,
      sessions: db.sessions.length,
    }));
    return Response.json({ status: "ok", ...counts });
  } catch (cause) {
    return Response.json(
      {
        status: "error",
        error:
          cause instanceof Error ? cause.message : "data directory unwritable",
      },
      { status: 503 },
    );
  }
}
