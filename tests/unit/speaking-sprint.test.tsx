import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("filters prompts by topic", () => {
    render(<SpeakingSprint />);

    fireEvent.change(screen.getByRole("combobox", { name: "Filter speaking topics" }), {
      target: { value: "WORK & CAREER" },
    });
    expect(screen.getByRole("heading", { name: "Explain a skill you want to master." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /New prompt/ }));
    expect(screen.getByRole("heading", { name: "Explain a skill you want to master." })).toBeInTheDocument();
  });

  it("saves and removes favorite prompts in local storage", async () => {
    render(<SpeakingSprint />);

    await waitFor(() => expect(screen.getByRole("button", { name: /Save prompt/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Save prompt/ }));
    expect(screen.getByRole("button", { name: /Saved prompt/ })).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("speakup-speaking-sprint-favorites")).toContain("perfect-day");
    expect(await screen.findByText("★ 1 saved prompt")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Saved prompt/ }));
    expect(screen.getByText("★ 0 saved prompts")).toBeInTheDocument();
  });

  it("starts and pauses the countdown", () => {
    render(<SpeakingSprint />);

    fireEvent.click(screen.getByRole("button", { name: /Start speaking/ }));
    expect(screen.getByRole("button", { name: /Sprint in progress/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: /Start speaking/ })).toBeInTheDocument();
  });

  it("restores completed sprints and XP from local storage", async () => {
    window.localStorage.setItem("speakup-speaking-sprint-completions", "3");
    window.localStorage.setItem("speakup-speaking-sprint-favorites", JSON.stringify(["perfect-day"]));
    render(<SpeakingSprint />);

    expect(await screen.findByText("30 XP")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("3", { selector: "strong" })).toBeInTheDocument());
    expect(screen.getByText("★ 1 saved prompt")).toBeInTheDocument();
  });
});
