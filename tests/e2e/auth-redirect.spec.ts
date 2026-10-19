import { expect, test } from "@playwright/test";

test("anonymous visitors are redirected from the home page to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("anonymous visitors are redirected from protected pages to login", async ({ page }) => {
  await page.goto("/practice");
  await expect(page).toHaveURL(/\/login\?next=%2Fpractice$/);
});

test("anonymous API requests are rejected", async ({ request, baseURL }) => {
  const response = await request.get(new URL("/api/chat", baseURL).toString());
  expect(response.status()).toBe(401);
});
