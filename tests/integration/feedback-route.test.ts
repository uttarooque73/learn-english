import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/feedback/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/feedback", () => {
  it("rejects missing messages without calling Ollama", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learnerMessage: "Hello" }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns structured feedback and vocabulary from Ollama", async () => {
    const feedback = {
      originalSentence: "I go to work yesterday.",
      correctedSentence: "I went to work yesterday.",
      explanation: "Use the past tense for a completed action.",
      issues: [{ original: "I go", corrected: "I went", category: "grammar", importance: "important", explanation: "Use past tense for yesterday." }],
      practicePrompt: "Tell me one more thing you did yesterday using past tense.",
      tips: ["Use went, not go, for yesterday."],
      pronunciationTip: "Say the final consonants clearly.",
      vocabulary: [{ phrase: "completed action", meaning: "An action that has finished.", example: "I finished the report." }],
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ message: { content: JSON.stringify(feedback) } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learnerMessage: "I go to work yesterday.", assistantMessage: "What did you do at work?" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(feedback);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toMatchObject({ model: "llama3.1:8b", stream: false, format: "json" });
  });
});
