import { expect, test } from "@playwright/test";

test("AI and Us provides discussion and paragraph practice tabs", async ({ page }) => {
  await page.goto("/ai-and-us");
  await expect(page.getByRole("heading", { name: "AI and Us" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "AI and Us Discussion" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Paragraph Practice" })).toBeVisible();
  await page.getByRole("tab", { name: "Paragraph Practice" }).click();
  await expect(page.getByRole("heading", { name: "Paragraph Practice" })).toBeVisible();
  await expect(page.getByLabel("Paragraph")).toBeVisible();
  await page.getByRole("button", { name: "Save paragraph" }).click();
  await expect(page.getByText("Paragraph saved to your learning history.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved paragraphs" })).toBeVisible();
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
