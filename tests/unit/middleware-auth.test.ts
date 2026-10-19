import { afterEach, describe, expect, it, vi } from "vitest";

const { redirectMock, nextMock, jsonMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: URL) => ({ type: "redirect", url })),
  nextMock: vi.fn(() => ({ type: "next" })),
  jsonMock: vi.fn((body: unknown, init: unknown) => ({ type: "json", body, init })),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    next: nextMock,
    redirect: redirectMock,
    json: jsonMock,
  },
}));

import { proxy } from "../../src/proxy";

function makeRequest(path: string, session?: string) {
  const url = new URL(path, "http://localhost:3000");
  return {
    nextUrl: url,
    url: url.toString(),
    cookies: {
      get: (name: string) => name === "speakup_session" && session ? { value: session } : undefined,
    },
  } as never;
}

afterEach(() => vi.clearAllMocks());

describe("authentication proxy", () => {
  it("redirects the root page to login when anonymous", async () => {
    const response = await proxy(makeRequest("/"));
    expect(response).toMatchObject({ type: "redirect" });
    const redirectUrl = redirectMock.mock.calls[0][0];
    expect(redirectUrl.pathname).toBe("/login");
    expect(redirectUrl.searchParams.get("next")).toBe("/");
  });

  it("redirects anonymous pages to login and preserves the requested URL", async () => {
    const response = await proxy(makeRequest("/practice?mode=speaking"));
    expect(response).toMatchObject({ type: "redirect" });
    const redirectUrl = redirectMock.mock.calls[0][0];
    expect(redirectUrl.pathname).toBe("/login");
    expect(redirectUrl.searchParams.get("next")).toBe("/practice?mode=speaking");
  });

  it("returns 401 for anonymous API requests", async () => {
    const response = await proxy(makeRequest("/api/chat"));
    expect(response).toMatchObject({ type: "json" });
    expect(jsonMock).toHaveBeenCalledWith(
      { error: "Authentication required. Please sign in." },
      expect.objectContaining({ status: 401 }),
    );
  });

  it("allows the login page and auth endpoint without a session", async () => {
    await proxy(makeRequest("/login"));
    await proxy(makeRequest("/api/auth"));
    expect(nextMock).toHaveBeenCalledTimes(2);
  });

  it("allows selected language helper endpoints without a session", async () => {
    await proxy(makeRequest("/api/grammar/improve"));
    expect(nextMock).toHaveBeenCalledOnce();
  });
});
