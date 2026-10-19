import { expect, test as base } from "@playwright/test";
import { randomUUID } from "node:crypto";

// Feature tests must authenticate now that protected pages are actually gated.
// Create an isolated account per test to keep parallel runs independent.
const test = base.extend({
  // Playwright fixture lifecycle uses a parameter named "use"; it is not a React hook.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  page: async ({ page }, use) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Create an account" }).click();
    await page.getByLabel("Your name").fill("E2E Learner");
    await page.getByLabel("Email address").fill(`e2e-${randomUUID()}@example.com`);
    await page.getByLabel("Password").fill("Speakup-E2E-password-123!");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL("http://localhost:3000/", { timeout: 15_000 });
    await use(page);
  },
});

export { expect, test };
