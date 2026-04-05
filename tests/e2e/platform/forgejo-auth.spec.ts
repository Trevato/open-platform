import { test, expect } from "@playwright/test";
import { urls, admin } from "../helpers/config";

test.describe("Forgejo authentication", () => {
  test("admin is logged in via storageState", async ({ page }) => {
    await page.goto(urls.forgejo);
    // Should see dashboard (not login form)
    await expect(page.locator(".dashboard")).toBeVisible({ timeout: 5_000 });
  });

  test("API access with admin credentials", async ({ request }) => {
    const response = await request.get(`${urls.forgejo}/api/v1/user`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${admin.username}:${admin.password}`).toString("base64")}`,
      },
    });
    expect(response.status()).toBe(200);
    const user = await response.json();
    expect(user.login).toBe(admin.username);
  });

  test("system org exists", async ({ request }) => {
    const response = await request.get(`${urls.forgejo}/api/v1/orgs/system`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${admin.username}:${admin.password}`).toString("base64")}`,
      },
    });
    expect(response.status()).toBe(200);
  });

  test("system repos exist", async ({ request }) => {
    const expectedRepos = ["open-platform", "template", "console", "op-api"];
    const auth = {
      Authorization: `Basic ${Buffer.from(`${admin.username}:${admin.password}`).toString("base64")}`,
    };

    for (const repo of expectedRepos) {
      const response = await request.get(
        `${urls.forgejo}/api/v1/repos/system/${repo}`,
        { headers: auth },
      );
      expect(response.status(), `system/${repo} should exist`).toBe(200);
    }
  });
});
