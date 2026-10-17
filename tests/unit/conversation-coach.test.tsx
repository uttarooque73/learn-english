import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConversationCoach } from "@/components/conversation-coach";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ConversationCoach", () => {
  it("shows voice-first setup and a text fallback when no session has started", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessions: [] }), { status: 200 })));
    render(<ConversationCoach />);
    expect(screen.getByRole("tab", { name: /practice/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /your english, your moment/i })).toBeTruthy();
    expect(screen.getByLabelText(/conversation topic/i)).toBeTruthy();
    expect(screen.getByLabelText(/tutor voice/i)).toBeTruthy();
    expect(screen.getByLabelText(/speaking speed/i)).toBeTruthy();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/conversation-coach/sessions", { cache: "no-store" }));
  });


  it("automatically reactivates the microphone after the tutor finishes speaking", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const spoken: SpeechSynthesisUtterance[] = [];
    const synthesis = {
      cancel: vi.fn(),
      speak: vi.fn((utterance: SpeechSynthesisUtterance) => spoken.push(utterance)),
      getVoices: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
    vi.stubGlobal("SpeechSynthesisUtterance", class {
      text: string;
      lang = "en-US";
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    });
    const startRecognition = vi.fn();
    const recognitions: MockRecognition[] = [];
    class MockRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((event: never) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start = startRecognition;
      stop = vi.fn();
      abort = vi.fn();
      constructor() { recognitions.push(this); }
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockRecognition });

    const session = {
      id: "session-1", title: "Everyday life", scenario: "Everyday life",
      difficulty: "Intermediate", status: "active", startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), durationSeconds: 0, turns: [],
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/chat") return new Response("That sounds good. What did you do today?", { status: 200 });
      if (init?.method === "POST") return new Response(JSON.stringify({ session }), { status: 200 });
      if (init?.method === "PATCH") return new Response(JSON.stringify({ session }), { status: 200 });
      return new Response(JSON.stringify({ sessions: [] }), { status: 200 });
    }));

    render(<ConversationCoach />);
    fireEvent.click(screen.getByRole("button", { name: /start conversation/i }));
    await waitFor(() => expect(spoken).toHaveLength(1));
    spoken[0].onend?.(new Event("end") as SpeechSynthesisEvent);
    await waitFor(() => expect(startRecognition).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /stop recording/i })).toBeTruthy();

    recognitions[0].onresult?.({ resultIndex: 0, results: [{ 0: { transcript: "I am doing well" } }] } as never);
    recognitions[0].onend?.();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(spoken).toHaveLength(2));
  });

  it("shows saved-history and progress sections", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessions: [] }), { status: 200 })));
    render(<ConversationCoach />);
    fireEvent.click(screen.getByRole("tab", { name: /history/i }));
    expect(screen.getByRole("heading", { name: /your story starts here/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /progress/i }));
    expect(screen.getByRole("heading", { name: /progress, not perfection/i })).toBeTruthy();
    expect(screen.getByText(/not an automated proficiency score/i)).toBeTruthy();
  });

  it("resumes the elapsed timer when reopening an active saved session", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const session = {
      id: "session-active", title: "Everyday life", scenario: "Everyday life",
      difficulty: "Intermediate", status: "active", startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), durationSeconds: 120, turns: [],
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/conversation-coach/sessions?id=session-active") {
        return new Response(JSON.stringify({ session }), { status: 200 });
      }
      return new Response(JSON.stringify({ sessions: [session] }), { status: 200 });
    }));

    render(<ConversationCoach />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/conversation-coach/sessions", { cache: "no-store" }));
    fireEvent.click(screen.getByRole("tab", { name: /history/i }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /in progress.*everyday life/i }));
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("tab", { name: /practice/i }));
    expect(screen.getByText(/2m 0s/)).toBeTruthy();

    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText(/2m 1s/)).toBeTruthy();
    vi.useRealTimers();
  });
});
