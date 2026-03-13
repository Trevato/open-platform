import { test as setup, expect } from "@playwright/test";
import { urls, serviceUrl, admin } from "./helpers/config";

const consoleUrl = serviceUrl("console");

setup("authenticate with Forgejo", async ({ page }) => {
  // Verify credentials are set
  expect(admin.password, "FORGEJO_ADMIN_PASSWORD must be set").toBeTruthy();

  // Login to Forgejo
  await page.goto(`${urls.forgejo}/user/login`);
  await page.fill('input[name="user_name"]', admin.username);
  await page.fill('input[name="password"]', admin.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for redirect to dashboard
  await page.waitForURL("**/", { timeout: 15_000 });
  await expect(page.locator(".dashboard")).toBeVisible({ timeout: 5_000 });

  // ── Console OAuth2 setup ──────────────────────────────────────────────────
  // Complete the console OAuth2 flow once here so all tests have both
  // Forgejo and console sessions. This avoids hitting better-auth's rate
  // limiter (3 requests/60s per IP) during individual console tests.

  try {
    await page.goto(consoleUrl);

    // If console redirects to dashboard (already has session), skip OAuth2
    if (!page.url().includes("/dashboard")) {
      const cta = page.locator('button:has-text("Get Started")').first();
      await expect(cta).toBeVisible({ timeout: 10_000 });
      await cta.click();

      await page.waitForURL(/forgejo\.|\/dashboard/, { timeout: 20_000 });

      if (page.url().includes("/user/login")) {
        await page.fill('input[name="user_name"]', admin.username);
        await page.fill('input[name="password"]', admin.password);
        await page.getByRole('button', { name: 'Sign in' }).click();
        await page.waitForURL(/forgejo\.|\/dashboard/, { timeout: 20_000 });
      }

      if (page.url().includes("login/oauth/authorize")) {
        const grantBtn = page.locator('#authorize-app, button[name="granted"][value="true"]');
        await expect(grantBtn).toBeVisible({ timeout: 10_000 });
        await grantBtn.click();
        await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
      }

      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    }
  } catch {
    // Console OAuth2 setup is best-effort — console tests will fall back
    // to signInToConsole() if the session isn't established here
  }

  // Save auth state for all test projects
  await page.context().storageState({ path: ".auth/state.json" });
  await page.context().storageState({ path: ".auth/console-state.json" });
});
