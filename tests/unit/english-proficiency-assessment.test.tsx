import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EnglishProficiencyAssessment } from "@/components/english-proficiency-assessment";

describe("English proficiency assessment", () => {
  it("runs the quiz and displays skill results with AI feedback", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("## What went well\nYou selected useful vocabulary."));
        controller.close();
      },
    }), { status: 200, headers: { "Content-Type": "text/plain" } })));
    render(<EnglishProficiencyAssessment />);
    fireEvent.click(screen.getByRole("button", { name: /start assessment/i }));
    expect(screen.getByRole("heading", { name: /yesterday, i ___ to the office early/i })).toBeInTheDocument();
    for (let index = 0; index < 8; index += 1) {
      const options = screen.getByRole("group", { name: "Answer options" });
      fireEvent.click(options.querySelectorAll("button")[index === 0 ? 1 : 0]);
      fireEvent.click(screen.getByRole("button", { name: /next question|continue to writing/i }));
    }
    expect(screen.getByRole("heading", { name: /tell us how you express an idea/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/your answer/i), { target: { value: "I solved a difficult problem at work and learned to plan carefully." } });
    fireEvent.click(screen.getByRole("button", { name: /generate my report/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /your practice level/i })).toBeInTheDocument());
    expect(screen.getByText(/what went well/i)).toBeInTheDocument();
    expect(screen.getByText("Grammar")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ method: "POST", body: expect.stringContaining("English proficiency assessment report") }));
    vi.unstubAllGlobals();
  });

  it("does not allow moving forward without selecting an answer", () => {
    render(<EnglishProficiencyAssessment />);
    fireEvent.click(screen.getByRole("button", { name: /start assessment/i }));
    expect(screen.getByRole("button", { name: /next question/i })).toBeDisabled();
  });

  it("shows an actionable error if the AI report cannot be generated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "AI service unavailable" }), { status: 503 })));
    render(<EnglishProficiencyAssessment />);
    fireEvent.click(screen.getByRole("button", { name: /start assessment/i }));
    for (let index = 0; index < 8; index += 1) {
      fireEvent.click(screen.getByRole("group", { name: "Answer options" }).querySelector("button")!);
      fireEvent.click(screen.getByRole("button", { name: /next question|continue to writing/i }));
    }
    fireEvent.click(screen.getByRole("button", { name: /generate my report/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AI service unavailable");
    vi.unstubAllGlobals();
  });
});
