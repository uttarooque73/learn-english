import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpeakingSprint } from "@/components/speaking-sprint";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SpeakingSprint", () => {
  it("shows a speaking prompt and can switch to another prompt", () => {
    render(<SpeakingSprint />);

    expect(screen.getByRole("heading", { name: "Describe your perfect day." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /New prompt/ }));
    expect(screen.queryByRole("heading", { name: "Describe your perfect day." })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start speaking/ })).toBeInTheDocument();
  });

  it("starts and pauses the countdown", () => {
    render(<SpeakingSprint />);

    fireEvent.click(screen.getByRole("button", { name: /Start speaking/ }));
    expect(screen.getByRole("button", { name: /Sprint in progress/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: /Start speaking/ })).toBeInTheDocument();
  });

  it("restores completed sprints and XP from local storage", () => {
    window.localStorage.setItem("speakup-speaking-sprint-completions", "3");
    render(<SpeakingSprint />);

    expect(screen.getByText("3", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("30 XP")).toBeInTheDocument();
  });
});
