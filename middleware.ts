import { NextRequest, NextResponse } from "next/server";

type SessionClaims = { sub?: unknown; exp?: unknown };

async function hasValidSession(token: string | undefined): Promise<boolean> {
  const secret = process.env.AUTH_SECRET || (process.env.NODE_ENV !== "production"
    ? "speakup-local-development-secret-change-before-deploying"
    : "");
  if (!secret || secret.length < 32 || !token) return false;

  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const normalizedSignature = signature.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(Math.ceil(signature.length / 4) * 4, "=");
    const signatureBytes = Uint8Array.from(atob(normalizedSignature), (char) => char.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(payload));
    if (!valid) return false;

    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(normalizedPayload)) as SessionClaims;
    return typeof claims.sub === "string" &&
      /^[0-9a-f-]{36}$/i.test(claims.sub) &&
      typeof claims.exp === "number" &&
      claims.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth",
  "/api/feedback",
  "/api/grammar/improve",
  "/api/vocabulary/define",
  "/api/vocabulary/examples",
  "/api/vocabulary/context",
  "/api/pronunciation",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml";
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isPublicPath(pathname)) return NextResponse.next();

  if (!await hasValidSession(request.cookies.get("speakup_session")?.value)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
