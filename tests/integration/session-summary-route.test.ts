import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/session-summary/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/session-summary", () => {
  it("rejects an incomplete transcript without calling Ollama", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(new Request("http://localhost/api/session-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: "Job interview", messages: [{ role: "user", content: "Hello" }] }),
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a bounded structured summary from Ollama", async () => {
    const summary = {
      topicSummary: "Practised introducing work experience.",
      keyPoints: ["Introduced current role"],
      corrections: [{ original: "I work here since 2020.", improved: "I have worked here since 2020.", reason: "Use present perfect for an action continuing to now." }],
      vocabulary: [{ phrase: "hands-on experience", meaning: "Practical experience doing something." }],
      strengths: ["Gave a relevant example"],
      improvements: ["Add a specific result"],
      followUpExercise: "Repeat the answer and include one measurable result.",
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ message: { content: JSON.stringify(summary) } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(new Request("http://localhost/api/session-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: "Job interview", difficulty: "Intermediate",
        messages: [{ role: "user", content: "I work here since 2020." }, { role: "assistant", content: "Tell me about your experience." }],
      }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(summary);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toMatchObject({ model: "llama3.1:8b", stream: false, format: "json" });
  });
});
