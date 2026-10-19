import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { saveVocabulary } = vi.hoisted(() => ({ saveVocabulary: vi.fn() }));
vi.mock("@/lib/learning-storage", () => ({ saveVocabulary }));
vi.mock("@/components/listen-button", () => ({ ListenButton: ({ text, label }: { text: string; label: string }) => <button type="button" aria-label={label}>{text}</button> }));

import { AdaptiveVocabularyContext } from "@/components/adaptive-vocabulary-context";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AdaptiveVocabularyContext", () => {
  it("starts with a usable dialogue and asks a comprehension question", () => {
    render(<AdaptiveVocabularyContext />);
    expect(screen.getByRole("heading", { name: /clarifying a project deadline/i })).toBeInTheDocument();
    expect(screen.getByText(/keep me posted/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check answer/i })).toBeDisabled();
  });

  it("gives feedback after selecting and checking an answer", () => {
    render(<AdaptiveVocabularyContext />);
    fireEvent.click(screen.getByRole("button", { name: /send her updates when there is new information/i }));
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    expect(screen.getByText(/exactly right/i)).toBeInTheDocument();
    expect(screen.getByText(/keep me posted means to continue telling someone/i)).toBeInTheDocument();
    expect(screen.getByText(/your turn/i)).toBeInTheDocument();
  });

  it("saves the target phrase into the existing vocabulary bank", async () => {
    saveVocabulary.mockReturnValue({ id: "saved-1" });
    render(<AdaptiveVocabularyContext />);
    fireEvent.click(screen.getByRole("button", { name: /save phrase to my vocabulary/i }));
    await waitFor(() => expect(saveVocabulary).toHaveBeenCalledWith(expect.objectContaining({
      phrase: "keep me posted",
      meaning: expect.stringContaining("Tell me when"),
      category: "expression",
      sourceScenario: "Workplace discussion",
    })));
    expect(screen.getByRole("button", { name: /saved to my vocabulary/i })).toBeDisabled();
  });

  it("sends selected context, level, and target phrase to the AI endpoint", async () => {
    const generated = {
      lesson: {
        title: "Asking for an update", setup: "A colleague wants to know about progress.",
        targetPhrase: "touch base", meaningInContext: "Talk briefly to share an update.",
        dialogue: [
          { speaker: "Sam", text: "Can we touch base tomorrow?" },
          { speaker: "Lee", text: "Sure, after the morning meeting." },
          { speaker: "Sam", text: "I want to review the launch plan." },
          { speaker: "Lee", text: "I'll bring the latest numbers." },
        ],
        question: "What does Sam want to do?", options: ["Share an update", "Cancel a meeting", "Hire someone"], answerIndex: 0,
        explanation: "Touch base means to talk briefly.", challenge: "Use touch base in a sentence.",
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => generated });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdaptiveVocabularyContext />);
    fireEvent.change(screen.getByLabelText(/target word or phrase/i), { target: { value: "touch base" } });
    fireEvent.change(screen.getByLabelText(/english level/i), { target: { value: "advanced" } });
    fireEvent.click(screen.getByRole("button", { name: /generate adaptive dialogue/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/vocabulary/context", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ scenario: "Workplace discussion", level: "advanced", targetPhrase: "touch base" }),
    })));
    expect(await screen.findByRole("heading", { name: /asking for an update/i })).toBeInTheDocument();
  });
});
