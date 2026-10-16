import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PracticeExperience } from "@/components/practice-experience";

const prompts = [
  { number: "01", title: "Everyday life", description: "Talk about your day.", icon: "☕", tone: "peach" },
  { number: "02", title: "At work", description: "Practice meetings.", icon: "↗", tone: "lavender" },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PracticeExperience", () => {
  it("lets the learner select a scenario and offers a starter prompt", () => {
    render(<PracticeExperience prompts={prompts} />);

    const workScenario = screen.getByRole("button", { name: /At work/ });
    fireEvent.click(workScenario);

    expect(workScenario).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText((_, element) => element?.tagName === "P" && /practice a conversation about/i.test(element.textContent ?? "") && /at work/i.test(element.textContent ?? ""))).toBeInTheDocument();

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
      body: JSON.stringify({ scenario: "Everyday life", messages: [{ role: "user", content: "Hello coach" }] }),
    }));
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("SpeakUp AI")).toBeInTheDocument();
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
});
