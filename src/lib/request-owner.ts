import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { OWNER_COOKIE, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * Authenticated sessions are authoritative for data ownership. The owner cookie
 * remains a compatibility mechanism for anonymous learners only.
 */
export function resolveOwnerId(request: NextRequest): string {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return session.ownerId;

  const anonymousOwner = request.cookies.get(OWNER_COOKIE)?.value;
  return anonymousOwner && /^[0-9a-f-]{36}$/i.test(anonymousOwner)
    ? anonymousOwner
    : randomUUID();
}

export function synchronizeOwnerCookie(
  response: NextResponse,
  request: NextRequest,
  ownerId: string,
): NextResponse {
  if (request.cookies.get(OWNER_COOKIE)?.value !== ownerId) {
    response.cookies.set(OWNER_COOKIE, ownerId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}
