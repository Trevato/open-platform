/**
 * Console E2E Tests
 *
 * Tests the management console UI and API at https://console.{domain}.
 * The console uses better-auth with Forgejo OAuth2 — separate from the
 * Forgejo session in global.setup.ts.
 */
import { test, expect, Page } from "@playwright/test";
import { serviceUrl, admin } from "../helpers/config";

const consoleUrl = serviceUrl("console");

async function signInToConsole(page: Page): Promise<void> {
  await page.goto(`${consoleUrl}/dashboard`);
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  if (page.url().includes("/dashboard")) return;

  await page.goto(consoleUrl);
  const cta = page.locator('button:has-text("Get Started")').first();
  await expect(cta).toBeVisible({ timeout: 10_000 });
  await cta.click();

  await page.waitForURL(/forgejo\.|\/dashboard/, { timeout: 20_000 });

  if (page.url().includes("/user/login")) {
    await page.fill('input[name="user_name"]', admin.username);
    await page.fill('input[name="password"]', admin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/forgejo\.|\/dashboard/, { timeout: 20_000 });
  }

  if (page.url().includes("login/oauth/authorize")) {
    const grantBtn = page.locator(
      '#authorize-app, button[name="granted"][value="true"]',
    );
    await expect(grantBtn).toBeVisible({ timeout: 10_000 });
    await grantBtn.click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  }

  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
}

// ─── Availability ─────────────────────────────────────────────────────────────

test.describe("Console: availability", () => {
  test("console loads and returns 200", async ({ page }) => {
    const response = await page.goto(consoleUrl);
    expect(response?.status(), "Console should return 200").toBeLessThan(400);
    await expect(page).not.toHaveTitle(/error|not found|500/i);
    await expect(page.locator("text=Open Platform").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("unauthenticated /dashboard redirects to landing page", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto(`${consoleUrl}/dashboard`);
    await page.waitForLoadState("networkidle");

    const url = page.url();
    const isLanding =
      url === `${consoleUrl}/` ||
      url === consoleUrl ||
      !url.includes("/dashboard");
    const hasAuthCta = await page
      .locator(
        'a:has-text("Get Started"), button:has-text("Get Started"), a:has-text("Sign in")',
      )
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    expect(
      isLanding || hasAuthCta,
      "Unauthenticated user should see landing or sign-in",
    ).toBe(true);
  });

  test("landing page has sign-in CTA buttons", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(consoleUrl);
    await expect(
      page.locator('button:has-text("Get Started")').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Auth Flow ────────────────────────────────────────────────────────────────

test.describe("Console: auth flow", () => {
  test("pre-established session grants dashboard access", async ({ page }) => {
    await page.goto(`${consoleUrl}/dashboard`);
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/dashboard");
    expect(page.url()).not.toContain("forgejo");
    await expect(page.locator("text=Open Platform").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ─── Dashboard Navigation ──────────────────────────────────────────────────────

test.describe("Console: dashboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    await signInToConsole(page);
  });

  test("dashboard loads with sidebar nav", async ({ page }) => {
    await page.goto(`${consoleUrl}/dashboard`);
    await expect(page).not.toHaveTitle(/error|500/i);
    await expect(page.locator("text=Open Platform").first()).toBeVisible({
      timeout: 10_000,
    });
    // Verify sidebar nav items exist
    await expect(page.locator("text=Overview").first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("text=Apps").first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("text=Services").first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("text=MCP").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("services page loads without error", async ({ page }) => {
    const response = await page.goto(`${consoleUrl}/dashboard/services`);
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText(
      "Internal Server Error",
    );
  });

  test("apps page loads without error", async ({ page }) => {
    const response = await page.goto(`${consoleUrl}/dashboard/apps`);
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("MCP page loads with config snippets", async ({ page }) => {
    const response = await page.goto(`${consoleUrl}/dashboard/mcp`);
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toContainText("Application error");
    // Verify MCP connector elements
    await expect(page.locator("text=Endpoint").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("text=Authentication").first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("text=Configuration").first()).toBeVisible({
      timeout: 5_000,
    });
    // Verify tool tabs are present
    await expect(page.locator("text=Claude Code").first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("text=Cursor").first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("text=VS Code").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("users page loads without error", async ({ page }) => {
    const response = await page.goto(`${consoleUrl}/dashboard/users`);
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("settings page loads without error", async ({ page }) => {
    const response = await page.goto(`${consoleUrl}/dashboard/settings`);
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("nonexistent route returns gracefully, not 500", async ({ page }) => {
    const response = await page.goto(`${consoleUrl}/dashboard/nonexistent-xyz`);
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});

// ─── API Endpoints ────────────────────────────────────────────────────────────

test.describe("Console: API endpoints", () => {
  test.beforeEach(async ({ page }) => {
    await signInToConsole(page);
  });

  test("GET /api/platform/services returns platform services", async ({
    page,
    request,
  }) => {
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const response = await request.get(`${consoleUrl}/api/platform/services`, {
      headers: { Cookie: cookieHeader },
    });
    expect(response.status()).not.toBe(500);
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("services");
      expect(Array.isArray(body.services)).toBe(true);
      const names = body.services.map((s: { name: string }) =>
        s.name.toLowerCase(),
      );
      expect(names).toContain("forgejo");
    }
  });

  test("GET /api/platform/apps returns apps", async ({ page, request }) => {
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const response = await request.get(`${consoleUrl}/api/platform/apps`, {
      headers: { Cookie: cookieHeader },
    });
    expect(response.status()).not.toBe(500);
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("apps");
      expect(Array.isArray(body.apps)).toBe(true);
    }
  });

  test("GET /api/role returns admin role for opadmin", async ({
    page,
    request,
  }) => {
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const response = await request.get(`${consoleUrl}/api/role`, {
      headers: { Cookie: cookieHeader },
    });
    expect(response.status()).not.toBe(500);
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("role");
      expect(body.role).toBe("admin");
    }
  });

  test("GET /api/platform/users without session returns 401", async ({
    request,
  }) => {
    // Send request with no cookies at all to guarantee no session
    const response = await request.get(`${consoleUrl}/api/platform/users`, {
      headers: { Cookie: "" },
    });
    expect(response.status()).toBe(401);
  });
});

// ─── Robustness ───────────────────────────────────────────────────────────────

test.describe("Console: robustness", () => {
  test.beforeEach(async ({ page }) => {
    await signInToConsole(page);
  });

  test("rapid sequential navigation does not crash", async ({ page }) => {
    const routes = [
      `${consoleUrl}/dashboard`,
      `${consoleUrl}/dashboard/services`,
      `${consoleUrl}/dashboard/apps`,
      `${consoleUrl}/dashboard/mcp`,
      `${consoleUrl}/dashboard/users`,
      `${consoleUrl}/dashboard`,
    ];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("body")).not.toContainText("Application error");
      await expect(page.locator("body")).not.toContainText(
        "Internal Server Error",
      );
    }
  });

  test("browser back/forward navigation works without errors", async ({
    page,
  }) => {
    await page.goto(`${consoleUrl}/dashboard`);
    await page.goto(`${consoleUrl}/dashboard/services`);
    await page.goto(`${consoleUrl}/dashboard/apps`);

    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toContainText("Application error");

    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toContainText("Application error");

    await page.goForward();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("unknown /dashboard route returns gracefully, not 500", async ({
    page,
  }) => {
    const response = await page.goto(
      `${consoleUrl}/dashboard/nonexistent-slug-xyz`,
    );
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});
