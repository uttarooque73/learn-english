import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiPersonalTutor } from "@/components/ai-personal-tutor";
import { initializeDatabasePersistence } from "@/lib/client-persistence";

vi.mock("@/lib/client-persistence", () => ({ initializeDatabasePersistence: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/learning-storage", () => ({
  getVocabulary: vi.fn(() => [{ id: "word-1", phrase: "follow through", meaning: "finish what you promised", example: "I will follow through on the plan.", savedAt: "2026-01-01T00:00:00.000Z" }]),
  getSessions: vi.fn(() => [{ id: "session-1" }]),
}));

describe("AI personal tutor", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(initializeDatabasePersistence).mockResolvedValue(undefined);
  });

  it("renders personalisation controls and learning context", async () => {
    render(<AiPersonalTutor />);
    expect(screen.getByRole("heading", { name: /what would you like to work on/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Main goal")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("saved vocabulary items").previousElementSibling).toHaveTextContent("1");
      expect(screen.getByText("saved practice sessions").previousElementSibling).toHaveTextContent("1");
    });
  });

  it("sends the learner request to the existing chat API and displays the streamed answer", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tutor-memory" && !init?.method) {
        return new Response(JSON.stringify({ conversation: {
          id: "f6d0c6a2-6d1e-4df2-8f7b-8b20e7eeb5a1", messages: [],
          goal: "Speak more confidently", level: "Intermediate", feedbackStyle: "balanced",
        } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (String(input) === "/api/chat") {
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode("Try saying: I will explain the project clearly."));
            controller.close();
          },
        }), { status: 200, headers: { "Content-Type": "text/plain", "X-Conversation-Id": "f6d0c6a2-6d1e-4df2-8f7b-8b20e7eeb5a1" } });
      }
      throw new Error("Unexpected fetch: " + String(input));
    }));
    render(<AiPersonalTutor />);
    const textbox = screen.getByLabelText("Your question or practice response");
    await waitFor(() => expect(textbox).not.toBeDisabled());
    fireEvent.change(textbox, { target: { value: "Help me explain my work." } });
    fireEvent.submit(textbox.closest("form")!);
    await waitFor(() => expect(screen.getByText("Try saying: I will explain the project clearly.")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith("/api/chat", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("Help me explain my work."),
    }));
  });

  it("shows an actionable error when the AI service is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/tutor-memory") {
        return new Response(JSON.stringify({ conversation: {
          id: "f6d0c6a2-6d1e-4df2-8f7b-8b20e7eeb5a1", messages: [],
          goal: "Speak more confidently", level: "Intermediate", feedbackStyle: "balanced",
        } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Cannot connect to Ollama." }), { status: 503 });
    }));
    render(<AiPersonalTutor />);
    const textbox = screen.getByLabelText("Your question or practice response");
    await waitFor(() => expect(textbox).not.toBeDisabled());
    fireEvent.change(textbox, { target: { value: "Explain past tense." } });
    fireEvent.submit(textbox.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot connect to Ollama.");
  });
});
