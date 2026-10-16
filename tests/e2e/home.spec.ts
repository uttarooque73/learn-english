import { expect, test } from "@playwright/test";

test("dashboard renders and opens the practice room", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Good to see you" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await page.getByRole("link", { name: /Start a practice session/i }).click();

  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByRole("heading", { name: "Practice room" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What feels right today?" })).toBeVisible();
});

test("practice room offers guided role-play scenarios and difficulty levels", async ({ page }) => {
  await page.goto("/practice");

  const interview = page.getByRole("button", { name: /Job interview/ });
  await expect(interview).toBeVisible();
  await interview.click();
  await expect(page.getByText("Topic: Job interview")).toBeVisible();

  const difficulty = page.getByRole("combobox", { name: "Difficulty" });
  await expect(difficulty).toHaveValue("Beginner");
  await difficulty.selectOption("Advanced");
  await expect(difficulty).toHaveValue("Advanced");
  await expect(page.getByText(/adapt to your advanced level/i)).toBeVisible();

  await expect(page.getByRole("button", { name: /Daily stand-up/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Explain a technical concept/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Restaurant conversation/ })).toBeVisible();
});
