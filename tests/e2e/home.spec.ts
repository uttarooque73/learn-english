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
