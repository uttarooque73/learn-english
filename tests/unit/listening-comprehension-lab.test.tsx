import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ListeningComprehensionLab } from "@/components/listening-comprehension-lab";

const { initializeDatabasePersistence, upsertSession } = vi.hoisted(() => ({
  initializeDatabasePersistence: vi.fn(),
  upsertSession: vi.fn(),
}));

vi.mock("@/lib/client-persistence", () => ({ initializeDatabasePersistence }));
vi.mock("@/lib/learning-storage", () => ({ upsertSession }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ListeningComprehensionLab", () => {
  it("shows listening exercises and requires all answers before checking", async () => {
    initializeDatabasePersistence.mockResolvedValue(undefined);
    render(<ListeningComprehensionLab />);
    expect(await screen.findByRole("heading", { name: /choose a listening exercise/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /a change to the team meeting/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check answers/i })).toBeDisabled();
    expect(screen.getByText(/listen before you read/i)).toBeInTheDocument();
  });

  it("checks answers, explains results, saves the attempt, and supports retry", async () => {
    initializeDatabasePersistence.mockResolvedValue(undefined);
    render(<ListeningComprehensionLab />);
    const answers = [
      screen.getByLabelText("10:30"),
      screen.getByLabelText("The design team needs more time"),
      screen.getByLabelText("In the small conference room on the second floor"),
    ];
    answers.forEach((answer) => fireEvent.click(answer));
    fireEvent.click(screen.getByRole("button", { name: /check answers/i }));
    expect(await screen.findByText("3/3")).toBeInTheDocument();
    expect(screen.getByText(/The speaker says the meeting moved to half past ten/i)).toBeInTheDocument();
    await waitFor(() => expect(upsertSession).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByRole("button", { name: /check answers/i })).toBeInTheDocument();
    expect(screen.getByText("0/3 answered")).toBeInTheDocument();
  });

  it("reveals and hides the transcript without exposing it by default", async () => {
    initializeDatabasePersistence.mockResolvedValue(undefined);
    render(<ListeningComprehensionLab />);
    expect(screen.queryByText(/Good morning, everyone/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reveal transcript/i }));
    expect(screen.getByText(/Good morning, everyone/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hide transcript/i }));
    expect(screen.queryByText(/Good morning, everyone/i)).not.toBeInTheDocument();
  });

  it("switches exercises and resets previous answers", async () => {
    initializeDatabasePersistence.mockResolvedValue(undefined);
    render(<ListeningComprehensionLab />);
    fireEvent.click(await screen.findByRole("button", { name: /ordering at a café/i }));
    expect(screen.getByRole("heading", { name: /ordering at a café/i })).toBeInTheDocument();
    expect(screen.getByText("0/3 answered")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check answers/i })).toBeDisabled();
  });
});
