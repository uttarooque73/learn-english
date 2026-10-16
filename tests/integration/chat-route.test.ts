import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/chat/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/chat", () => {
  it("rejects malformed conversation input without calling Ollama", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "system", content: "bad role" }] }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("streams text from Ollama and forwards conversation context", async () => {
    const ollamaBody = [
      JSON.stringify({ message: { content: "Hello" }, done: false }),
      JSON.stringify({ message: { content: " there!" }, done: false }),
      JSON.stringify({ done: true }),
      "",
    ].join("\n");
    const fetchMock = vi.fn().mockResolvedValue(new Response(ollamaBody, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: "At work",
          messages: [
            { role: "user", content: "I have a meeting today." },
            { role: "assistant", content: "What is the meeting about?" },
            { role: "user", content: "It is about our release." },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    await expect(response.text()).resolves.toBe("Hello there!");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    const sent = JSON.parse(String(options.body)) as { model: string; stream: boolean; messages: { role: string; content: string }[] };
    expect(sent.model).toBe("qwen3:4b");
    expect(sent.stream).toBe(true);
    expect(sent.messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(sent.messages[0]?.content).toContain("At work");
    expect(sent.messages[1]?.content).toContain("meeting today");
  });

  it("returns a helpful service error when Ollama is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("connection refused")));

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Cannot connect to Ollama"),
    });
  });
});
