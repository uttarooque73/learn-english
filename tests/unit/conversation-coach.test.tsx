import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("shows saved-history and progress sections", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessions: [] }), { status: 200 })));
    render(<ConversationCoach />);
    fireEvent.click(screen.getByRole("tab", { name: /history/i }));
    expect(screen.getByRole("heading", { name: /your story starts here/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /progress/i }));
    expect(screen.getByRole("heading", { name: /progress, not perfection/i })).toBeTruthy();
    expect(screen.getByText(/not an automated proficiency score/i)).toBeTruthy();
  });
});
