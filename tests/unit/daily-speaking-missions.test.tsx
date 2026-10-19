import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DailySpeakingMissions } from "@/components/daily-speaking-missions";

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ skills: [], recurringMistakes: [] }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("DailySpeakingMissions", () => {
  it("renders a daily mission and its three-part speaking structure", async () => {
    render(<DailySpeakingMissions />);
    expect(screen.getByRole("heading", { name: "Your next confident conversation starts here" })).toBeInTheDocument();
    expect(screen.getByText("01 · Open")).toBeInTheDocument();
    expect(screen.getByText("02 · Develop")).toBeInTheDocument();
    expect(screen.getByText("03 · Finish")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/learning/progress", { cache: "no-store" }));
  });

  it("lets a learner complete a mission and saves it to history", async () => {
    render(<DailySpeakingMissions />);
    fireEvent.click(screen.getByRole("button", { name: /I practised this aloud/ }));
    expect(screen.getByRole("status", { name: "" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/What felt easier/), { target: { value: "I spoke more clearly." } });
    fireEvent.click(screen.getByRole("button", { name: "Complete mission" }));
    expect(await screen.findByText(/Mission complete/)).toBeInTheDocument();
    expect(window.localStorage.getItem("speakup-daily-speaking-missions-v1")).toContain("I spoke more clearly.");
    expect(screen.getByText(/1\/60 saved/)).toBeInTheDocument();
  });

  it("adapts to a learner's grammar weakness", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ skills: [{ skillKey: "grammar", mastery: 0.2, confidence: 0.3, evidenceCount: 5 }], recurringMistakes: [] }) }));
    render(<DailySpeakingMissions />);
    expect(await screen.findByRole("heading", { name: "Tell a short story in the past tense" })).toBeInTheDocument();
  });

  it("restores today's completion from browser storage", async () => {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    window.localStorage.setItem("speakup-daily-speaking-missions-v1", JSON.stringify([{ date, missionId: "past-story", title: "Saved mission", reflection: "", completedAt: new Date().toISOString() }]));
    render(<DailySpeakingMissions />);
    expect(await screen.findByText(/Mission complete/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /I practised this aloud/ })).toBeDisabled();
  });
});
