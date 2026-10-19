import { expect, test } from "@playwright/test";

test("AI and Us provides discussion and paragraph practice tabs", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "A healthy routine can make each day easier. Planning meals saves time and reduces stress. A short walk can improve energy. Which habit would you like to build first?",
    });
  });
  await page.route("**/api/ai-and-us", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ paragraphs: [], attempts: [] }) });
      return;
    }
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as { kind?: string; id?: string; title?: string; text?: string; level?: string };
      if (payload.kind === "paragraph") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ paragraph: { id: "saved-paragraph", title: payload.title ?? "Practice paragraph", text: payload.text ?? "", level: payload.level ?? "Intermediate", createdAt: "2026-10-19T00:00:00.000Z" } }),
        });
        return;
      }
      if (payload.kind === "feedback") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ paragraphId: "saved-paragraph", feedback: {
            overallSummary: "Your paragraph is clear. Review verb tense and duration phrases.",
            corrections: [{ originalSentence: "I work here since five years.", correctedSentence: "I have worked here for five years.", naturalAlternative: "I've been working here for five years.", category: "Grammar", explanation: "Use for with a duration and present perfect for an activity continuing now." }],
            vocabularySuggestions: [{ original: "very good", suggested: "effective", reason: "More precise for a workplace outcome." }],
            practiceSuggestions: ["Practise present perfect with for and since."],
          } }),
        });
        return;
      }
    }
    await route.continue();
  });
  await page.goto("/ai-and-us");
  await expect(page.getByRole("heading", { name: "AI and Us", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "AI and Us Discussion" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Paragraph Practice" })).toBeVisible();
  await page.getByRole("tab", { name: "Paragraph Practice" }).click();
  await expect(page.getByRole("heading", { name: "Paragraph Practice" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Paragraph", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Generate paragraph" }).click();
  await expect(page.getByRole("textbox", { name: "Paragraph", exact: true })).toHaveValue(/A healthy routine can make each day easier/);
  await page.getByRole("button", { name: "Save paragraph" }).click();
  await expect(page.getByText("Paragraph saved to your learning history.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved paragraphs" })).toBeVisible();
  await page.getByRole("button", { name: "Get writing feedback" }).click();
  await expect(page.getByRole("heading", { name: "Paragraph feedback" })).toBeVisible();
  await expect(page.getByText("Review verb tense and duration phrases.")).toBeVisible();
  await expect(page.getByText("Practise present perfect with for and since.")).toBeVisible();
});

test("discussion lets learners configure and start an AI-generated reading topic", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "Technology helps people share ideas. It makes teamwork easier across long distances. Many learners use online tools to build new skills. What technology has helped you recently?",
    });
  });
  await page.goto("/ai-and-us");
  await page.getByLabel("Topic").selectOption("Technology");
  await page.getByRole("button", { name: /Start a discussion/ }).click();
  await expect(page.getByText("AI SENTENCE 1 OF 4")).toBeVisible();
  await expect(page.getByText("Technology helps people share ideas.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Play sentence/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Read aloud/ })).toBeVisible();
});
