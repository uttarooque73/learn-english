import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, OWNER_COOKIE, SESSION_COOKIE } from "@/lib/auth";
import { resolveOwnerId, synchronizeOwnerCookie } from "@/lib/request-owner";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

const originalSecret = process.env.AUTH_SECRET;
const ownerId = "0c1e3a77-4e28-4bc8-8b1d-98d6e777ab41";
const email = "request-owner-test@example.com";
process.env.AUTH_SECRET = "request-owner-test-secret-that-is-long-enough";

beforeAll(() => {
  ensurePersistenceSchema();
  getDatabase().prepare(`
    INSERT OR IGNORE INTO learner_accounts
      (id, email, display_name, password_salt, password_hash, owner_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("request-owner-test-account-id", email, "Request Owner Test", "test-salt", "test-hash", ownerId);
});

afterAll(() => {
  getDatabase().prepare("DELETE FROM learner_accounts WHERE owner_id = ?").run(ownerId);
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
      ownerId: ownerId,
      email: email,
      displayName: "Learner",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    const req = request(`${SESSION_COOKIE}=${sessionToken}; ${OWNER_COOKIE}=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);

    expect(resolveOwnerId(req)).toBe(ownerId);
  });

  it("preserves a valid anonymous owner cookie when no session exists", () => {
    const req = request(`${OWNER_COOKIE}=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
    expect(resolveOwnerId(req)).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("synchronizes a stale owner cookie to the verified session owner", () => {
    const sessionToken = createSessionToken({
      ownerId: ownerId,
      email: email,
      displayName: "Learner",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    const req = request(`${SESSION_COOKIE}=${sessionToken}; ${OWNER_COOKIE}=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
    const response = synchronizeOwnerCookie(NextResponse.json({ ok: true }), req, resolveOwnerId(req));

    expect(response.cookies.get(OWNER_COOKIE)?.value).toBe(ownerId);
    expect(response.cookies.get(OWNER_COOKIE)?.httpOnly).toBe(true);
  });
});
