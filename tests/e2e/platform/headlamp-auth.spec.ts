import { test, expect } from "@playwright/test";
import { urls } from "../helpers/config";
import { handleGrantPage } from "../helpers/auth";

test.describe("Headlamp OIDC flow", () => {
  test("OIDC redirect chain completes", async ({ page }) => {
    // Navigate to Headlamp — it redirects to Forgejo for OIDC
    await page.goto(urls.headlamp);

    // Handle grant page if first-time authorization
    await handleGrantPage(page);

    // Should end up on Headlamp with cluster view
    await page.waitForURL(`${urls.headlamp}/**`, { timeout: 30_000 });

    // Headlamp shows cluster info once OIDC succeeds
    await expect(
      page
        .locator('text="Cluster"')
        .or(page.locator('[class*="cluster"]'))
        .or(page.locator('text="Namespaces"'))
        .or(page.locator('text="Workloads"'))
    ).toBeVisible({ timeout: 15_000 });
  });
});
