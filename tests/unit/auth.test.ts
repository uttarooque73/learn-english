import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionToken, hashPassword, verifyPassword, verifySessionToken } from "@/lib/auth";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

const originalSecret = process.env.AUTH_SECRET;
process.env.AUTH_SECRET = "test-secret-that-is-long-enough-for-auth-tests";
const ownerId = "f6d0c6a2-6d1e-4df2-8f7b-8b20e7eeb5a1";
const email = "account-auth-test@example.com";

beforeAll(() => {
  ensurePersistenceSchema();
  getDatabase().prepare(`
    INSERT OR IGNORE INTO learner_accounts
      (id, email, display_name, password_salt, password_hash, owner_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("auth-test-account-id", email, "English Learner", "test-salt", "test-hash", ownerId);
});

afterAll(() => {
  getDatabase().prepare("DELETE FROM learner_accounts WHERE owner_id = ?").run(ownerId);
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

  it("round-trips a signed session token for an existing account", () => {
    const token = createSessionToken({
      ownerId,
      email,
      displayName: "English Learner",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    expect(verifySessionToken(token)).toMatchObject({
      ownerId,
      email,
      displayName: "English Learner",
    });
  });

  it("revokes a previously issued token when its account is deleted", () => {
    const token = createSessionToken({
      ownerId,
      email,
      displayName: "English Learner",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    expect(verifySessionToken(token)).not.toBeNull();
    getDatabase().prepare("DELETE FROM learner_accounts WHERE owner_id = ?").run(ownerId);
    expect(verifySessionToken(token)).toBeNull();
    getDatabase().prepare(`
      INSERT INTO learner_accounts
        (id, email, display_name, password_salt, password_hash, owner_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("auth-test-account-id", email, "English Learner", "test-salt", "test-hash", ownerId);
  });

  it("rejects tampered and expired session tokens", () => {
    const token = createSessionToken({
      ownerId,
      email,
      displayName: "English Learner",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    expect(verifySessionToken(token + "tampered")).toBeNull();
    const expired = createSessionToken({
      ownerId,
      email,
      displayName: "English Learner",
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });
    expect(verifySessionToken(expired)).toBeNull();
  });
});
