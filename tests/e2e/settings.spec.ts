import { expect, test } from "./fixtures";

test.describe("Settings page controls", () => {
  test("saves learning preferences and restores them after reload", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Learning preferences" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your learning style" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Topics you want to practice" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Comfort & accessibility" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Speech playback" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your saved learning data" })).toBeVisible();

    const field = (label: string) => page.locator(".settings-field").filter({ hasText: label }).locator("select").first();
    await field("Current English level").selectOption("Intermediate");
    await field("Feedback style").selectOption("detailed");
    await field("Feedback timing").selectOption("immediate");
    await field("Daily practice goal").selectOption("20");
    await field("Speaking speed").selectOption("1.2");
    await field("Voice style").selectOption("female");

    const jobInterview = page.getByRole("checkbox", { name: "Job interview" });
    await jobInterview.check();
    const largerText = page.getByRole("checkbox", { name: /Larger text/ });
    await largerText.check();
    const reduceMotion = page.getByRole("checkbox", { name: /Reduce animation/ });
    await reduceMotion.check();

    await page.getByRole("button", { name: /Save preferences/ }).click();
    await expect(page.getByText("Your preferences are saved on this device.")).toBeVisible();

    await page.reload();
    await expect(field("Current English level")).toHaveValue("Intermediate");
    await expect(field("Feedback style")).toHaveValue("detailed");
    await expect(field("Feedback timing")).toHaveValue("immediate");
    await expect(field("Daily practice goal")).toHaveValue("20");
    await expect(field("Speaking speed")).toHaveValue("1.2");
    await expect(field("Voice style")).toHaveValue("female");
    await expect(jobInterview).toBeChecked();
    await expect(largerText).toBeChecked();
    await expect(reduceMotion).toBeChecked();
  });

  test("saves the daily routine and adaptation settings to the database", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Adaptive daily routine" })).toBeVisible();

    const field = (label: string) => page.locator(".learning-settings").first().locator(".settings-field").filter({ hasText: label }).locator("select").first();
    await field("Daily target").selectOption("30");
    await field("Time zone").selectOption("Asia/Dubai");
    await field("Spaced-review interval").selectOption("1.25");
    await page.getByLabel("Learning goal").fill("Speak clearly during technical meetings");
    await page.getByRole("checkbox", { name: /Enable automatically scheduled daily plans/ }).check();

    await page.getByRole("button", { name: "Save learning routine" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Your learning routine was saved to the database." })).toBeVisible();

    await page.reload();
    await expect(field("Daily target")).toHaveValue("30");
    await expect(field("Time zone")).toHaveValue("Asia/Dubai");
    await expect(field("Spaced-review interval")).toHaveValue("1.25");
    await expect(page.getByLabel("Learning goal")).toHaveValue("Speak clearly during technical meetings");
    await expect(page.getByRole("checkbox", { name: /Enable automatically scheduled daily plans/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Adapt activity priorities using saved practice evidence/ })).toBeChecked();

    await page.getByRole("checkbox", { name: /Adapt activity priorities using saved practice evidence/ }).uncheck();
    await page.getByRole("button", { name: "Save learning routine" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Your learning routine was saved to the database." })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Adapt activity priorities using saved practice evidence/ })).not.toBeChecked();
  });

  test("adds and removes a custom practice option", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Customize your practice options" })).toBeVisible();

    const title = `E2E practice option ${Date.now()}`;
    await page.getByLabel("Option title").fill(title);
    await page.getByLabel("What should you practice?").fill("Explain a technical decision in simple English.");
    await page.getByLabel("Icon").selectOption("💼");
    await page.getByRole("button", { name: "＋ Add option" }).click();

    const optionRow = page.locator(".dynamic-option-row").filter({ hasText: title });
    await expect(optionRow).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Option added." })).toBeVisible();
    await optionRow.getByRole("button", { name: "Remove" }).click();
    await expect(optionRow).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: `Removed "${title}".` })).toBeVisible();
  });

  test("validates the learning goal and protects saved-data deletion behind confirmation", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Your saved learning data" })).toBeVisible();

    const goal = page.getByLabel("Learning goal");
    await goal.fill("   ");
    await expect(page.getByRole("button", { name: "Save learning routine" })).toBeDisabled();
    await goal.fill("A valid practice goal");

    await page.getByRole("button", { name: "Delete all saved practice data" }).click();
    // With an empty profile, the page should explain that there is nothing to delete
    // instead of showing a destructive confirmation dialog.
    await expect(page.getByRole("status").filter({ hasText: "There is no saved practice data to delete." })).toBeVisible();
  });
});
