import { NextRequest, NextResponse } from "next/server";

type SessionClaims = { sub?: unknown; exp?: unknown };

async function validOwnerId(token: string | undefined): Promise<string | null> {
  const secret = process.env.AUTH_SECRET || (process.env.NODE_ENV !== "production"
    ? "speakup-local-development-secret-change-before-deploying"
    : "");
  if (!secret || secret.length < 32 || !token) return null;
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const signatureBytes = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(signature.length / 4) * 4, "=")), (char) => char.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(payload));
    if (!valid) return null;
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(normalizedPayload)) as SessionClaims;
    if (typeof claims.sub !== "string" || !/^[0-9a-f-]{36}$/i.test(claims.sub)) return null;
    if (typeof claims.exp !== "number" || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims.sub;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const ownerId = await validOwnerId(request.cookies.get("speakup_session")?.value);
  if (!ownerId) return NextResponse.next();

  const requestHeaders = new Headers(request.headers);
  const existingCookie = requestHeaders.get("cookie") ?? "";
  const cookieParts = existingCookie.split(";").map((part) => part.trim()).filter(Boolean)
    .filter((part) => !part.startsWith("speakup_owner="));
  cookieParts.push("speakup_owner=" + ownerId);
  requestHeaders.set("cookie", cookieParts.join("; "));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
