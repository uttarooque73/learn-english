import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LearningPlan } from "@/components/learning-plan";
import { initializeDatabasePersistence, readPersistedValue, writePersistedValue } from "@/lib/client-persistence";
import { getSessions, getVocabulary } from "@/lib/learning-storage";
import { getLearningAnalytics } from "@/lib/learning-analytics";

vi.mock("@/lib/client-persistence", () => ({
  initializeDatabasePersistence: vi.fn(),
  readPersistedValue: vi.fn(),
  writePersistedValue: vi.fn(),
}));
vi.mock("@/lib/learning-storage", () => ({
  getSessions: vi.fn(),
  getVocabulary: vi.fn(),
  reviewVocabulary: vi.fn(),
}));
vi.mock("@/lib/learning-analytics", () => ({ getLearningAnalytics: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LearningPlan", () => {
  it("restores the selected time target and today's checklist from database-backed persistence", async () => {
    const date = new Date();
    const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    vi.mocked(initializeDatabasePersistence).mockResolvedValue(undefined);
    vi.mocked(readPersistedValue).mockReturnValue(JSON.stringify({
      target: 15,
      date: today,
      completed: ["Review due vocabulary"],
    }));
    vi.mocked(getVocabulary).mockReturnValue([]);
    vi.mocked(getSessions).mockReturnValue([]);
    vi.mocked(getLearningAnalytics).mockReturnValue({
      currentStreak: 2,
      commonCorrections: [],
    } as unknown as ReturnType<typeof getLearningAnalytics>);

    render(<LearningPlan />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "1 of 2 activities completed" })).toBeTruthy();
      expect(screen.getByLabelText("Daily time target")).toHaveValue("15");
    });
    await waitFor(() => expect(writePersistedValue).toHaveBeenCalledWith(
      "speakup:daily-learning-plan:v1",
      expect.stringContaining('"target":15'),
    ));
    expect(writePersistedValue).toHaveBeenCalledWith(
      "speakup:daily-learning-plan:v1",
      expect.stringContaining('"Review due vocabulary"'),
    );
  });
  it("includes real-life role-play in a full daily routine", async () => {
    vi.mocked(initializeDatabasePersistence).mockResolvedValue(undefined);
    vi.mocked(readPersistedValue).mockReturnValue(JSON.stringify({ target: 30, date: "not-today", completed: [] }));
    vi.mocked(getVocabulary).mockReturnValue([]);
    vi.mocked(getSessions).mockReturnValue([]);
    vi.mocked(getLearningAnalytics).mockReturnValue({
      currentStreak: 0,
      commonCorrections: [],
    } as unknown as ReturnType<typeof getLearningAnalytics>);

    render(<LearningPlan />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Role-play a real-life situation" })).toBeTruthy();
      expect(screen.getByText("Practice a situation you expect to face at work or in daily life.")).toBeTruthy();
    });
  });

});
