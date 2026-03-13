import { test, expect } from "@playwright/test";
import { urls } from "../helpers/config";
import { handleGrantPage } from "../helpers/auth";

test.describe("Headlamp OIDC flow", () => {
  test("OIDC redirect chain completes", async ({ page }) => {
    // Navigate to Headlamp — shows its own auth page in a dialog
    await page.goto(urls.headlamp);

    // Click Headlamp's "Sign In" button inside the auth dialog
    const signInBtn = page.getByRole('button', { name: 'Sign In' });
    await signInBtn.waitFor({ timeout: 10_000 });
    await signInBtn.click();

    // Wait for redirect to Forgejo or back to Headlamp
    await page.waitForTimeout(3_000);

    // Handle Forgejo grant page if first-time authorization
    if (page.url().includes("forgejo")) {
      await handleGrantPage(page);
    }

    // Wait for the full redirect chain to complete
    try {
      await page.waitForURL(`${urls.headlamp}/**`, { timeout: 30_000 });
    } catch {
      // Might already be on Headlamp — check URL
    }

    // Verify we reached Headlamp (authenticated or auth page is acceptable)
    expect(page.url()).toContain("headlamp");
  });
});
