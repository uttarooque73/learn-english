// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/speaking-feedback/route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const validFeedback = {
  overallScore: 82,
  summary: "Your answer is clear and relevant. Add a little more detail to support your main point.",
  categories: {
    fluency: { score: 80, feedback: "Your ideas flow naturally." },
    clarity: { score: 86, feedback: "Your main point is easy to follow." },
    grammar: { score: 78, feedback: "Check consistency when describing past events." },
    vocabulary: { score: 81, feedback: "Your word choices fit the topic." },
    structure: { score: 84, feedback: "The answer has a clear beginning and middle." },
  },
  strengths: ["You answer the prompt directly.", "You use a concrete example."],
  improvements: ["Add a short conclusion."],
  practicePrompt: "Explain the same idea in three short steps.",
};

describe("POST /api/speaking-feedback", () => {
  it("rejects invalid and too-short responses", async () => {
    const short = await POST(new Request("http://localhost/api/speaking-feedback", { method: "POST", body: JSON.stringify({ transcript: "Hi" }), headers: { "Content-Type": "application/json" } }));
    expect(short.status).toBe(400);
    await expect(short.json()).resolves.toMatchObject({ error: expect.stringContaining("four words") });
    const invalid = await POST(new Request("http://localhost/api/speaking-feedback", { method: "POST", body: "not-json" }));
    expect(invalid.status).toBe(400);
  });

  it("uses the configured Ollama model and returns a validated rubric", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434/");
    vi.stubEnv("OLLAMA_MODEL", "qwen3:4b");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ message: { content: JSON.stringify(validFeedback) } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(new Request("http://localhost/api/speaking-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: "Yesterday I explained our new feature to my teammate.", prompt: "Explain a feature", proficiency: "Intermediate", durationSeconds: 30 }) }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ feedback: { overallScore: 82, categories: { clarity: { score: 86 } } }, metrics: { wordCount: 8, durationSeconds: 30, wordsPerMinute: 16 }, assessmentType: "transcript" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(JSON.parse(String(options.body))).toMatchObject({ model: "qwen3:4b", stream: false, format: "json" });
  });

  it("returns an actionable unavailable-provider error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const response = await POST(new Request("http://localhost/api/speaking-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: "I practiced speaking English today." }) }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("Ollama") });
  });
});
