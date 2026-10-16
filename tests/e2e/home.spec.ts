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
  await page.waitForLoadState("networkidle");

  const interview = page.getByRole("button", { name: /Job interview/ });
  await expect(interview).toBeVisible();
  await interview.click();
  await expect(page.locator(".chat-header-copy")).toContainText("Topic: Job interview");

  const difficulty = page.getByRole("combobox", { name: "Difficulty" });
  await expect(difficulty).toHaveValue("Beginner");
  await difficulty.selectOption("Advanced");
  await expect(difficulty).toHaveValue("Advanced");
  await expect(page.getByText(/adapt to your advanced level/i)).toBeVisible();

  await expect(page.getByRole("button", { name: /Daily stand-up/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Explain a technical concept/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Restaurant conversation/ })).toBeVisible();
});


test("fluency page offers timed speaking and filler-word awareness exercises", async ({ page }) => {
  await page.goto("/fluency");

  await expect(page.getByRole("heading", { name: "Fluency & confidence" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Daily speaking prompt/ })).toBeVisible();

  await page.getByRole("button", { name: /One-minute talk/ }).click();
  await expect(page.getByRole("timer")).toHaveAttribute("aria-label", "60 seconds remaining");
  await page.getByRole("button", { name: "Start 1-minute timer" }).click();
  await expect(page.getByRole("button", { name: "Pause timer" })).toBeVisible();

  await page.getByRole("button", { name: /Filler-word awareness/ }).click();
  await page.getByLabel("Your response").fill("Um, I like this tool, you know, because it helps.");
  await expect(page.getByText("3 possible filler words detected")).toBeVisible();
  await page.getByRole("button", { name: "Finish exercise" }).click();
  await expect(page.getByRole("status")).toContainText("You wrote 10 words.");
});
