import { test, expect } from "@playwright/test";
import { urls } from "../helpers/config";

test.describe("Platform services respond", () => {
  test("Forgejo loads", async ({ page }) => {
    await page.goto(urls.forgejo);
    await expect(page).toHaveTitle(/Forgejo/i);
  });

  test("Woodpecker CI loads", async ({ page }) => {
    await page.goto(urls.ci);
    // Woodpecker redirects to login or shows repos page
    await expect(
      page.locator('text="Repos"').or(page.locator('text="Login"')).or(page.locator('text="Welcome"'))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Headlamp loads", async ({ page }) => {
    const response = await page.goto(urls.headlamp);
    expect(response?.status()).toBeLessThan(500);
  });

  test("MinIO console loads", async ({ page }) => {
    const response = await page.goto(urls.minio);
    expect(response?.status()).toBeLessThan(500);
  });

  test("S3 API responds", async ({ page }) => {
    const response = await page.goto(urls.s3);
    // S3 returns 403 (access denied) without credentials — that's expected
    expect(response?.status()).toBeLessThanOrEqual(403);
  });

  test("OAuth2-Proxy responds", async ({ page }) => {
    const response = await page.goto(`${urls.oauth2}/ping`);
    expect(response?.status()).toBe(200);
  });
});
