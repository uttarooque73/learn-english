import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/pronunciation/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/pronunciation", () => {
  it("rejects a missing recording before calling the service", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.append("expectedText", "Hello there.");
    const response = await POST(new Request("http://localhost/api/pronunciation", { method: "POST", body: form }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("audio clip") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies audio to the local service and returns bounded phoneme feedback", async () => {
    vi.stubEnv("PRONUNCIATION_SERVICE_URL", "http://127.0.0.1:8001/");
    const servicePayload = {
      score: 82.4, transcribe: "I went yesterday",
      differences: {
        phoneme_error_rate: 0.12, word_error_rate: 0,
        errors: [{ word: "went", expected: "w ɛ n t", actual: "w ɪ n", confidence: 0.88, phones: [{ expected: "ɛ", actual: "ɪ", confidence: 0.88 }] }],
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(servicePayload));
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.append("audio", new File(["audio-bytes"], "sample.webm", { type: "audio/webm" }));
    form.append("expectedText", "I went yesterday.");
    const response = await POST(new Request("http://localhost/api/pronunciation", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      score: 82, transcript: "I went yesterday", phonemeErrorRate: 0.12, wordErrorRate: 0,
      errors: [{ word: "went", expected: "w ɛ n t", actual: "w ɪ n", confidence: 0.88, phones: [{ expected: "ɛ", heard: "ɪ", confidence: 0.88 }] }],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8001/pronunciation");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
  });

  it("returns an actionable fallback when the local model service is offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    const form = new FormData();
    form.append("audio", new File(["audio-bytes"], "sample.webm", { type: "audio/webm" }));
    form.append("expectedText", "Hello there.");
    const response = await POST(new Request("http://localhost/api/pronunciation", { method: "POST", body: form }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("OpenPronounce companion service") });
  });
});
