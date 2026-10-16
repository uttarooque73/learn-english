import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/components/app-shell";

describe("AppShell", () => {
  it("renders the page title, subtitle, and navigation", () => {
    render(
      <AppShell
        activePage="practice"
        title="Practice room"
        subtitle="Choose a comfortable starting point."
      >
        <p>Practice content</p>
      </AppShell>,
    );

    expect(screen.getByRole("heading", { name: "Practice room", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Choose a comfortable starting point.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Practice room/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Shadowing & pronunciation/i })).toHaveAttribute("href", "/shadowing");
    expect(screen.getByRole("link", { name: /Daily Vocabulary/i })).toHaveAttribute("href", "/daily-vocabulary");
    expect(screen.getByText("Practice content")).toBeInTheDocument();
  });
});
