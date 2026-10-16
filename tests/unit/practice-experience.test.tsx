import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PracticeExperience } from "@/components/practice-experience";
import { getSessions } from "@/lib/learning-storage";

const prompts = [
  { number: "01", title: "Everyday life", description: "Talk about your day.", icon: "☕", tone: "peach" },
  { number: "02", title: "At work", description: "Practice meetings.", icon: "↗", tone: "lavender" },
];

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("PracticeExperience", () => {
  it("lets the learner select a scenario and offers a starter prompt", () => {
    render(<PracticeExperience prompts={prompts} />);

    const workScenario = screen.getByRole("button", { name: /At work/ });
    fireEvent.click(workScenario);

    expect(workScenario).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText((_, element) => element?.tagName === "P" && /role-play/i.test(element.textContent ?? "") && /at work/i.test(element.textContent ?? ""))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Help me get started/ }));
    expect(screen.getByLabelText("Your message")).toHaveValue(
      "Hi! I want to practice my English. Can we start with a simple question?",
    );
  });

  it("sends a message and displays the streamed AI reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("Hello "));
          controller.enqueue(new TextEncoder().encode("there!"));
          controller.close();
        },
      }), { status: 200, headers: { "Content-Type": "text/plain" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PracticeExperience prompts={prompts} />);
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Hello coach" } });
    fireEvent.click(within(screen.getByLabelText("Your message").closest("form")!).getByRole("button", { name: /Send message/ }));

    await waitFor(() => expect(screen.getByText("Hello there!")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ scenario: "At work", difficulty: "Beginner", feedbackStyle: "balanced", preferredTopics: [], messages: [{ role: "user", content: "Hello coach" }] }),
    }));
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("SpeakUp AI")).toBeInTheDocument();
  });

  it("requests an adaptive follow-up and saves it in the existing conversation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("Tell me about your latest project.", { status: 200, headers: { "Content-Type": "text/plain" } }))
      .mockResolvedValueOnce(new Response("What was the biggest challenge you solved?", { status: 200, headers: { "Content-Type": "text/plain" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PracticeExperience prompts={prompts} />);
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "I built an inventory service." } });
    fireEvent.click(within(screen.getByLabelText("Your message").closest("form")!).getByRole("button", { name: /Send message/ }));
    await waitFor(() => expect(screen.getByText("Tell me about your latest project.")).toBeInTheDocument());

    const followUpButton = screen.getByRole("button", { name: "Ask a follow-up question" });
    await waitFor(() => expect(followUpButton).toBeEnabled());
    fireEvent.click(followUpButton);
    await waitFor(() => expect(screen.getByText("What was the biggest challenge you solved?")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/chat", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"mode":"follow-up"'),
    }));
    await waitFor(() => expect(getSessions().some((session) =>
      session.messages?.some((message) => message.content === "What was the biggest challenge you solved?")
    )).toBe(true));
  });

  it("shows a helpful message when the API reports an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json({ error: "Cannot connect to Ollama." }, { status: 503 }),
    ));

    render(<PracticeExperience prompts={prompts} />);
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Hi" } });
    fireEvent.click(within(screen.getByLabelText("Your message").closest("form")!).getByRole("button", { name: /Send message/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cannot connect to Ollama."));
  });

  it("persists a generated summary alongside its saved conversation", async () => {
    const summary = {
      topicSummary: "Practised introducing work experience.",
      keyPoints: ["Introduced current role"],
      corrections: [{ original: "I work here since 2020.", improved: "I have worked here since 2020.", reason: "Use present perfect for an action continuing to now." }],
      vocabulary: [{ phrase: "hands-on experience", meaning: "Practical experience doing something." }],
      strengths: ["Gave a relevant example"],
      improvements: ["Add a specific result"],
      followUpExercise: "Repeat the answer and include one measurable result.",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("Tell me about your experience.", { status: 200, headers: { "Content-Type": "text/plain" } }))
      .mockResolvedValueOnce(Response.json(summary));
    vi.stubGlobal("fetch", fetchMock);

    render(<PracticeExperience prompts={prompts} />);
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "I work here since 2020." } });
    fireEvent.click(within(screen.getByLabelText("Your message").closest("form")!).getByRole("button", { name: /Send message/ }));
    await waitFor(() => expect(screen.getByText("Tell me about your experience.")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: /Summarize session/ })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: /Summarize session/ }));
    await waitFor(() => expect(getSessions().some((session) => session.summary?.topicSummary === summary.topicSummary)).toBe(true));
    const savedSession = getSessions().find((session) => session.summary?.topicSummary === summary.topicSummary);
    expect(savedSession?.messages).toContainEqual({ role: "user", content: "I work here since 2020." });
    expect(savedSession?.messages).toContainEqual({ role: "assistant", content: "Tell me about your experience." });
    expect(screen.getByRole("heading", { name: "Your learning summary" })).toBeInTheDocument();
  });

});
