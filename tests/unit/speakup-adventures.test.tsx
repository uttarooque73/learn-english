import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SpeakUpAdventures } from "@/components/speakup-adventures";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("SpeakUpAdventures", () => {
  it("shows the story map and locks destinations until the previous mission is completed", () => {
    render(<SpeakUpAdventures />);

    expect(screen.getByRole("heading", { name: /your words/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /the missing ticket/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /the merchant's riddle/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /the final clue/i })).toBeDisabled();
  });

  it("starts a chapter and displays its character's opening scene", () => {
    render(<SpeakUpAdventures />);

    fireEvent.click(screen.getByRole("button", { name: /start adventure/i }));

    expect(screen.getByRole("region", { name: /adventure conversation/i })).toBeInTheDocument();
    expect(screen.getByText(/your train leaves soon/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/your reply/i)).toBeInTheDocument();
  });

  it("restores unlocked progress from local storage", async () => {
    window.localStorage.setItem("speakup-adventures-progress-v1", JSON.stringify({
      xp: 100,
      unlocked: 1,
      completed: ["station"],
    }));

    render(<SpeakUpAdventures />);

    expect(await screen.findByRole("button", { name: /the merchant's riddle/i })).toBeEnabled();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText(/mission solved/i)).toBeInTheDocument();
  });
});
