import { afterEach, describe, expect, it } from "vitest";
import { createSessionToken, hashPassword, verifyPassword, verifySessionToken } from "@/lib/auth";

const originalSecret = process.env.AUTH_SECRET;
process.env.AUTH_SECRET = "test-secret-that-is-long-enough-for-auth-tests";

afterEach(() => {
  if (originalSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalSecret;
});

describe("account authentication primitives", () => {
  it("stores only a salted password hash and verifies the correct password", () => {
    const credentials = hashPassword("correct horse battery");
    expect(credentials.salt).not.toBe("correct horse battery");
    expect(credentials.hash).not.toContain("correct horse battery");
    expect(verifyPassword("correct horse battery", credentials.salt, credentials.hash)).toBe(true);
    expect(verifyPassword("incorrect password", credentials.salt, credentials.hash)).toBe(false);
  });

  it("round-trips a signed session token", () => {
    const token = createSessionToken({
      ownerId: "f6d0c6a2-6d1e-4df2-8f7b-8b20e7eeb5a1",
      email: "learner@example.com",
      displayName: "English Learner",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    expect(verifySessionToken(token)).toMatchObject({
      ownerId: "f6d0c6a2-6d1e-4df2-8f7b-8b20e7eeb5a1",
      email: "learner@example.com",
      displayName: "English Learner",
    });
  });

  it("rejects tampered and expired session tokens", () => {
    const token = createSessionToken({
      ownerId: "f6d0c6a2-6d1e-4df2-8f7b-8b20e7eeb5a1",
      email: "learner@example.com",
      displayName: "English Learner",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    expect(verifySessionToken(token + "tampered")).toBeNull();
    const expired = createSessionToken({
      ownerId: "f6d0c6a2-6d1e-4df2-8f7b-8b20e7eeb5a1",
      email: "learner@example.com",
      displayName: "English Learner",
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });
    expect(verifySessionToken(expired)).toBeNull();
  });
});
