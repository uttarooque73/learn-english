import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LiveSpeakingRoleplay } from "@/components/live-speaking-roleplay";

const { initializeDatabasePersistence, upsertSession } = vi.hoisted(() => ({
  initializeDatabasePersistence: vi.fn(),
  upsertSession: vi.fn(),
}));

vi.mock("@/lib/client-persistence", () => ({ initializeDatabasePersistence }));
vi.mock("@/lib/learning-storage", () => ({ upsertSession }));
vi.mock("@/components/listen-button", () => ({ ListenButton: ({ text, label }: { text: string; label: string }) => <button type="button" aria-label={label}>{text}</button> }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function streamResponse(value: string) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(value));
      controller.close();
    },
  }), { status: 200 });
}

describe("LiveSpeakingRoleplay", () => {
  it("offers scenario and round setup", async () => {
    initializeDatabasePersistence.mockResolvedValue(undefined);
    render(<LiveSpeakingRoleplay />);
    expect(await screen.findByRole("heading", { name: /where do you want to practise/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /team stand-up/i })).toBeTruthy();
    expect(screen.getByLabelText(/speaking level/i)).toBeTruthy();
    expect(screen.getByLabelText(/round length/i)).toBeTruthy();
  });

  it("starts a scenario, sends an answer, and saves practice history", async () => {
    initializeDatabasePersistence.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(streamResponse("What did you work on yesterday?")).mockResolvedValueOnce(streamResponse("That sounds useful. What is your next step?")));
    render(<LiveSpeakingRoleplay />);
    fireEvent.click(await screen.findByRole("button", { name: /start speaking roleplay/i }));
    expect(await screen.findByText("What did you work on yesterday?")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/your answer/i), { target: { value: "I fixed a bug yesterday." } });
    fireEvent.click(screen.getByRole("button", { name: /send answer/i }));
    expect(await screen.findByText("That sounds useful. What is your next step?")).toBeTruthy();
    await waitFor(() => expect(upsertSession).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shows a useful error when the tutor cannot start", async () => {
    initializeDatabasePersistence.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Tutor unavailable" }), { status: 503 })));
    render(<LiveSpeakingRoleplay />);
    fireEvent.click(await screen.findByRole("button", { name: /start speaking roleplay/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tutor unavailable");
  });
});
