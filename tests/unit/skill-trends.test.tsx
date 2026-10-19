import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillTrends } from "@/components/skill-trends";
import { initializeDatabasePersistence, readPersistedValue } from "@/lib/client-persistence";

vi.mock("@/lib/client-persistence", () => ({
  initializeDatabasePersistence: vi.fn(),
  readPersistedValue: vi.fn(),
}));

const review = (id: string, createdAt: string, scores: { overall: number; fluency: number; clarity: number; grammar: number; vocabulary: number; structure: number }) => ({
  id,
  createdAt,
  feedback: {
    overallScore: scores.overall,
    categories: {
      fluency: { score: scores.fluency, feedback: "Flow feedback" },
      clarity: { score: scores.clarity, feedback: "Clarity feedback" },
      grammar: { score: scores.grammar, feedback: "Grammar feedback" },
      vocabulary: { score: scores.vocabulary, feedback: "Vocabulary feedback" },
      structure: { score: scores.structure, feedback: "Structure feedback" },
    },
  },
});

describe("Speaking skill trends", () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it("compares the earliest and latest saved review and labels the score evidence", async () => {
    vi.mocked(initializeDatabasePersistence).mockResolvedValue(undefined);
    vi.mocked(readPersistedValue).mockReturnValue(JSON.stringify([
      review("new", "2026-10-19T10:00:00.000Z", { overall: 84, fluency: 80, clarity: 85, grammar: 78, vocabulary: 88, structure: 89 }),
      review("old", "2026-10-10T10:00:00.000Z", { overall: 64, fluency: 60, clarity: 65, grammar: 58, vocabulary: 68, structure: 69 }),
    ]));
    render(<SkillTrends />);

    expect(await screen.findByRole("heading", { name: "Speaking skill trends" })).toBeInTheDocument();
    expect(await screen.findByText("+20 pts")).toBeInTheDocument();
    expect(screen.getByText("84")).toBeInTheDocument();
    expect(screen.getByText("Flow & concision")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Grammar scores over time: 58, 78" })).toBeInTheDocument();
    expect(screen.getByText(/Scores reflect the written transcript/)).toBeInTheDocument();
    await waitFor(() => expect(readPersistedValue).toHaveBeenCalledWith("speakup:speaking-feedback-history"));
  });

  it("prompts the learner to create a baseline when no reviews exist", async () => {
    vi.mocked(initializeDatabasePersistence).mockResolvedValue(undefined);
    vi.mocked(readPersistedValue).mockReturnValue(null);
    render(<SkillTrends />);
    expect(await screen.findByText("No speaking trend yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start a speaking review/ })).toHaveAttribute("href", "/speaking-feedback");
  });

  it("ignores malformed assessment entries rather than presenting invented scores", async () => {
    vi.mocked(initializeDatabasePersistence).mockResolvedValue(undefined);
    vi.mocked(readPersistedValue).mockReturnValue(JSON.stringify([{ id: "bad", createdAt: "not-a-date", feedback: { overallScore: 130 } }]));
    render(<SkillTrends />);
    expect(await screen.findByText("No speaking trend yet")).toBeInTheDocument();
    expect(screen.queryByText("130")).not.toBeInTheDocument();
  });
});
