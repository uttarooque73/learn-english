import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "speakup_session";
export const OWNER_COOKIE = "speakup_owner";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type AuthSession = { ownerId: string; email: string; displayName: string; expiresAt: number };

type SessionClaims = { sub: string; email: string; name: string; exp: number };

function secret(): string {
  const configured = process.env.AUTH_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be configured with at least 32 characters.");
  }
  return "speakup-local-development-secret-change-before-deploying";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): { salt: string; hash: string } {
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  try {
    const actual = Buffer.from(hashPassword(password, salt).hash, "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createSessionToken(session: AuthSession): string {
  const claims: SessionClaims = {
    sub: session.ownerId,
    email: session.email,
    name: session.displayName,
    exp: session.expiresAt,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return payload + "." + sign(payload);
}

export function verifySessionToken(token: string | undefined | null): AuthSession | null {
  if (!token) return null;
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SessionClaims>;
    if (
      typeof claims.sub !== "string" || !/^[0-9a-f-]{36}$/i.test(claims.sub) ||
      typeof claims.email !== "string" || typeof claims.name !== "string" ||
      typeof claims.exp !== "number" || claims.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    return { ownerId: claims.sub, email: claims.email, displayName: claims.name, expiresAt: claims.exp };
  } catch {
    return null;
  }
}
