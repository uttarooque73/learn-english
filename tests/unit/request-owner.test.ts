import { afterAll, describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, OWNER_COOKIE, SESSION_COOKIE } from "@/lib/auth";
import { resolveOwnerId, synchronizeOwnerCookie } from "@/lib/request-owner";

const originalSecret = process.env.AUTH_SECRET;
process.env.AUTH_SECRET = "request-owner-test-secret-that-is-long-enough";

afterAll(() => {
  if (originalSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalSecret;
});

function request(cookieHeader = ""): NextRequest {
  return new NextRequest("http://localhost/api/persistence", {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

describe("authenticated learning data owner", () => {
  it("uses the verified session owner instead of a conflicting owner cookie", () => {
    const sessionToken = createSessionToken({
      ownerId: "f6d0c6a2-6d1e-4df2-8f7b-8b20e7eeb5a1",
      email: "learner@example.com",
      displayName: "Learner",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    const req = request(`${SESSION_COOKIE}=${sessionToken}; ${OWNER_COOKIE}=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);

    expect(resolveOwnerId(req)).toBe("f6d0c6a2-6d1e-4df2-8f7b-8b20e7eeb5a1");
  });

  it("preserves a valid anonymous owner cookie when no session exists", () => {
    const req = request(`${OWNER_COOKIE}=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
    expect(resolveOwnerId(req)).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("synchronizes a stale owner cookie to the verified session owner", () => {
    const sessionToken = createSessionToken({
      ownerId: "f6d0c6a2-6d1e-4df2-8f7b-8b20e7eeb5a1",
      email: "learner@example.com",
      displayName: "Learner",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    const req = request(`${SESSION_COOKIE}=${sessionToken}; ${OWNER_COOKIE}=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
    const response = synchronizeOwnerCookie(NextResponse.json({ ok: true }), req, resolveOwnerId(req));

    expect(response.cookies.get(OWNER_COOKIE)?.value).toBe("f6d0c6a2-6d1e-4df2-8f7b-8b20e7eeb5a1");
    expect(response.cookies.get(OWNER_COOKIE)?.httpOnly).toBe(true);
  });
});
