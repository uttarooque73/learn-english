import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("home page integration", () => {
  it("composes the dashboard and links users to practice", () => {
    const html = renderToStaticMarkup(createElement(HomePage));

    expect(html).toContain("Your learning snapshot");
    expect(html).toContain("What would you like to practice?");
    expect(html).toContain('href="/practice"');
    expect(html).toContain("SpeakUp AI");
  });
});
