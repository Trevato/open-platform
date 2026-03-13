import { test, expect } from "@playwright/test";
import { urls } from "../helpers/config";
import { handleGrantPage } from "../helpers/auth";

test.describe("Woodpecker OAuth2 flow", () => {
  test("OAuth2 redirect chain completes", async ({ page }) => {
    // Navigate to Woodpecker — shows login page
    await page.goto(urls.ci);

    // Click the Forgejo login button if visible
    const loginBtn = page.getByRole('button', { name: /Login to Woodpecker/i });
    if (await loginBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await loginBtn.click();
    }

    // Handle Forgejo grant page if first-time authorization
    await handleGrantPage(page);

    // Should end up on Woodpecker repos page
    await page.waitForURL(`${urls.ci}/**`, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Repositories', exact: true })).toBeVisible({ timeout: 10_000 });
  });
});
