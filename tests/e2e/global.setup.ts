import { test as setup, expect } from "@playwright/test";
import { urls, admin } from "./helpers/config";

setup("authenticate with Forgejo", async ({ page }) => {
  // Verify credentials are set
  expect(admin.password, "FORGEJO_ADMIN_PASSWORD must be set").toBeTruthy();

  // Login to Forgejo
  await page.goto(`${urls.forgejo}/user/login`);
  await page.fill('input[name="user_name"]', admin.username);
  await page.fill('input[name="password"]', admin.password);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL("**/", { timeout: 15_000 });
  await expect(page.locator(".dashboard")).toBeVisible({ timeout: 5_000 });

  // Save auth state for other tests
  await page.context().storageState({ path: ".auth/state.json" });
});
