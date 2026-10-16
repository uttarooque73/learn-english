import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FluencyExercises } from "@/components/fluency-exercises";

afterEach(() => cleanup());

describe("FluencyExercises", () => {
  it("switches exercises and counts words in the learner response", () => {
    render(<FluencyExercises />);

    fireEvent.click(screen.getByRole("button", { name: /Quick response/ }));
    expect(screen.getByText("What is one skill you would like to learn, and why?")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Your response"), { target: { value: "I want to learn English." } });
    expect(screen.getByText("5 words")).toBeInTheDocument();
  });

  it("counts possible filler words and shows a supportive reflection", () => {
    render(<FluencyExercises />);
    fireEvent.click(screen.getByRole("button", { name: /Filler-word awareness/ }));
    fireEvent.change(screen.getByLabelText("Your response"), { target: { value: "Um, I like this, you know." } });

    expect(screen.getByText("3 possible filler words detected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish exercise" }));
    expect(screen.getByRole("status")).toHaveTextContent("You wrote 6 words.");
    expect(screen.getByRole("status")).toHaveTextContent("Review the 3 possible filler word(s)");
  });

  it("starts and pauses the one-minute timer", () => {
    render(<FluencyExercises />);
    fireEvent.click(screen.getByRole("button", { name: /One-minute talk/ }));

    expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "60 seconds remaining");
    fireEvent.click(screen.getByRole("button", { name: "Start 1-minute timer" }));
    expect(screen.getByRole("button", { name: "Pause timer" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause timer" }));
    expect(screen.getByRole("button", { name: "Resume timer" })).toBeInTheDocument();
  });
});
