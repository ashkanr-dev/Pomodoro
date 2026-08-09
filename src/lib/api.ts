import type { NextRequest } from "next/server";

/**
 * Header carrying the anonymous, browser-generated identity. There is no
 * login: each browser mints a random id on first visit and sends it with every
 * request so two people sharing one deployment don't see each other's tasks.
 */
export const USER_HEADER = "x-pomodoro-user";

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const FALLBACK_USER_ID = "anonymous";

export function getUserId(request: NextRequest | Request): string {
  const raw = request.headers.get(USER_HEADER)?.trim();
  return raw && USER_ID_PATTERN.test(raw) ? raw : FALLBACK_USER_ID;
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** Parses a JSON body, returning `null` when the payload isn't an object. */
export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}
