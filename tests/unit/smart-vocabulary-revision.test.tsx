import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const storage = vi.hoisted(() => ({
  words: [] as Array<{ id: string; phrase: string; meaning: string; example: string; savedAt: string; category?: "word" | "collocation" | "phrasal verb" | "expression"; status?: "learning" | "familiar" | "mastered"; nextReviewAt?: string; reviewCount?: number }>,
  reviewVocabulary: vi.fn(),
}));

vi.mock("@/lib/client-persistence", () => ({
  initializeDatabasePersistence: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/learning-storage", () => ({
  getVocabulary: () => [...storage.words],
  getDueVocabulary: () => storage.words.filter((word) => !word.nextReviewAt || Date.parse(word.nextReviewAt) <= Date.now()),
  reviewVocabulary: storage.reviewVocabulary,
}));

vi.mock("@/components/listen-button", () => ({
  ListenButton: ({ text, label }: { text: string; label: string }) => <button type="button" aria-label={label}>{text}</button>,
}));

import { SmartVocabularyRevision } from "@/components/smart-vocabulary-revision";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  storage.words = [];
  storage.reviewVocabulary.mockReset();
});

describe("SmartVocabularyRevision", () => {
  it("directs learners to the word bank when no vocabulary is saved", async () => {
    render(<SmartVocabularyRevision />);

    expect(await screen.findByRole("heading", { name: /your review deck starts with your word bank/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open my vocabulary/i })).toHaveAttribute("href", "/vocabulary");
  });

  it("reveals a saved word and records the selected spaced-repetition rating", async () => {
    storage.words = [{
      id: "word-1",
      phrase: "meet a deadline",
      meaning: "Finish work by the required time.",
      example: "We worked together to meet the deadline.",
      savedAt: "2026-01-01T00:00:00.000Z",
      category: "collocation",
      status: "learning",
    }];
    storage.reviewVocabulary.mockImplementation((id: string, rating: string) => {
      expect(id).toBe("word-1");
      expect(rating).toBe("hard");
      storage.words = [{ ...storage.words[0], nextReviewAt: new Date(Date.now() + 2 * 86400000).toISOString(), reviewCount: 1 }];
      return storage.words[0];
    });

    render(<SmartVocabularyRevision />);

    expect(await screen.findByRole("heading", { name: "meet a deadline" })).toBeInTheDocument();
    expect(screen.queryByText("Finish work by the required time.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reveal meaning/i }));
    expect(screen.getByText("Finish work by the required time.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hard/i }));

    await waitFor(() => expect(storage.reviewVocabulary).toHaveBeenCalledWith("word-1", "hard"));
  });

  it("shows the all-caught-up state when every saved word is scheduled for later", async () => {
    storage.words = [{
      id: "future-word",
      phrase: "follow up",
      meaning: "Continue a conversation or check progress.",
      example: "I'll follow up tomorrow.",
      savedAt: "2026-01-01T00:00:00.000Z",
      nextReviewAt: new Date(Date.now() + 3 * 86400000).toISOString(),
    }];

    render(<SmartVocabularyRevision />);

    await waitFor(() => expect(screen.getByRole("heading", { name: /you’re all caught up/i })).toBeInTheDocument());
    expect(screen.getByText(/reviewed 0 words this session/i)).toBeInTheDocument();
  });
});
