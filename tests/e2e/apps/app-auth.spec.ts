import { test, expect } from "@playwright/test";
import { domain, prefix } from "../helpers/config";

test.describe("App authentication", () => {
  test("social app sign-in button triggers OAuth2 flow", async ({ page }) => {
    const socialUrl = `https://${prefix}social.${domain}`;

    // Navigate to social app
    const response = await page.goto(socialUrl);
    test.skip(
      response?.status() === 404 || response?.status() === 502,
      "social app not deployed"
    );

    // Find and click sign-in button
    const signInBtn = page.locator(
      'button:has-text("Sign in"), button:has-text("Login"), a:has-text("Sign in")'
    );
    await expect(signInBtn.first()).toBeVisible({ timeout: 5_000 });
    await signInBtn.first().click();

    // Should redirect to Forgejo for OAuth2
    await page.waitForURL(/forgejo.*oauth|authorize/, { timeout: 10_000 });
  });
});
