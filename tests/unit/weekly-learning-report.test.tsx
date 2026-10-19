import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WeeklyLearningReport } from "@/components/weekly-learning-report";

const { initializeDatabasePersistence, getSessions, getVocabulary } = vi.hoisted(() => ({
  initializeDatabasePersistence: vi.fn(),
  getSessions: vi.fn(),
  getVocabulary: vi.fn(),
}));

vi.mock("@/lib/client-persistence", () => ({ initializeDatabasePersistence }));
vi.mock("@/lib/learning-storage", () => ({ getSessions, getVocabulary }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WeeklyLearningReport", () => {
  it("shows a clear empty state when there is no saved learning history", async () => {
    initializeDatabasePersistence.mockResolvedValue(undefined);
    getSessions.mockReturnValue([]);
    getVocabulary.mockReturnValue([]);
    render(<WeeklyLearningReport />);
    expect(await screen.findByText(/Your first report starts with one practice session/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Generate AI report/i })).toBeDisabled();
  });

  it("summarizes saved practice and requests an AI report", async () => {
    initializeDatabasePersistence.mockResolvedValue(undefined);
    getSessions.mockReturnValue([{
      id: "session-1",
      scenario: "Daily stand-up",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      durationSeconds: 600,
      messageCount: 4,
      learnerMessages: [],
      summary: {
        topicSummary: "Work update",
        keyPoints: [],
        corrections: [{ original: "I am work", improved: "I work", reason: "Verb form" }],
        vocabulary: [],
        strengths: ["Clear explanations"],
        improvements: ["Past tense"],
        followUpExercise: "",
      },
    }]);
    getVocabulary.mockReturnValue([{
      id: "word-1", phrase: "follow up", meaning: "continue", example: "I'll follow up", savedAt: new Date().toISOString(),
    }]);
    const encoder = new TextEncoder();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("Weekly summary: Keep practising."));
        controller.close();
      },
    }), { status: 200 })));
    render(<WeeklyLearningReport />);
    expect(await screen.findByText("Clear explanations")).toBeTruthy();
    expect(screen.getByText("I work")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Generate AI report/i }));
    await waitFor(() => expect(screen.getByText("Weekly summary: Keep practising.")).toBeTruthy());
    expect(fetch).toHaveBeenCalledWith("/api/chat", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"mode":"tutor"'),
    }));
    vi.unstubAllGlobals();
  });

  it("surfaces AI service errors", async () => {
    initializeDatabasePersistence.mockResolvedValue(undefined);
    getSessions.mockReturnValue([{
      id: "session-1", scenario: "Free conversation", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      durationSeconds: 60, messageCount: 1, learnerMessages: [],
    }]);
    getVocabulary.mockReturnValue([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "AI is unavailable" }, { status: 503 })));
    render(<WeeklyLearningReport />);
    fireEvent.click(await screen.findByRole("button", { name: /Generate AI report/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AI is unavailable");
    vi.unstubAllGlobals();
  });
});
