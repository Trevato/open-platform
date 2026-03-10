import { test, expect } from "@playwright/test";
import { urls } from "../helpers/config";
import { handleGrantPage } from "../helpers/auth";

test.describe("Woodpecker OAuth2 flow", () => {
  test("OAuth2 redirect chain completes", async ({ page }) => {
    // Navigate to Woodpecker — it redirects to Forgejo for OAuth2
    await page.goto(urls.ci);

    // Handle grant page if first-time authorization
    await handleGrantPage(page);

    // Should end up on Woodpecker repos page
    await page.waitForURL(`${urls.ci}/**`, { timeout: 30_000 });
    await expect(
      page.locator('text="Repos"').or(page.locator('[class*="repo"]'))
    ).toBeVisible({ timeout: 10_000 });
  });
});
