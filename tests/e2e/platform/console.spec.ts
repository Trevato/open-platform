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
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/forgejo\.|\/dashboard/, { timeout: 20_000 });
  }

  if (page.url().includes("login/oauth/authorize")) {
    const grantBtn = page.locator('#authorize-app, button[name="granted"][value="true"]');
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
    await expect(page.locator("text=Open Platform").first()).toBeVisible({ timeout: 10_000 });
  });

  test("unauthenticated /dashboard redirects to landing page", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${consoleUrl}/dashboard`);
    await page.waitForLoadState("networkidle");

    const url = page.url();
    const isLanding = url === `${consoleUrl}/` || url === consoleUrl || !url.includes("/dashboard");
    const hasAuthCta = await page.locator(
      'a:has-text("Get Started"), button:has-text("Get Started"), a:has-text("Sign in")'
    ).first().isVisible({ timeout: 5_000 }).catch(() => false);

    expect(isLanding || hasAuthCta, "Unauthenticated user should see landing or sign-in").toBe(true);
  });

  test("landing page has sign-in CTA buttons", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(consoleUrl);
    await expect(
      page.locator('button:has-text("Get Started")').first()
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
    await expect(page.locator("text=Open Platform").first()).toBeVisible({ timeout: 10_000 });
  });

  test("clearing session cookie redirects away from /dashboard", async ({ page }) => {
    await page.context().clearCookies({ name: "__Secure-better-auth.session_token" });
    await page.goto(`${consoleUrl}/dashboard`);
    await page.waitForLoadState("networkidle");

    expect(page.url()).not.toContain("/dashboard");
  });
});

// ─── Dashboard Navigation ──────────────────────────────────────────────────────

test.describe("Console: dashboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    await signInToConsole(page);
  });

  test("dashboard loads with nav elements", async ({ page }) => {
    await page.goto(`${consoleUrl}/dashboard`);
    await expect(page).not.toHaveTitle(/error|500/i);
    await expect(page.locator("text=Open Platform").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=New Instance").first()).toBeVisible({ timeout: 5_000 });
  });

  test("services page loads without error", async ({ page }) => {
    const response = await page.goto(`${consoleUrl}/dashboard/services`);
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("apps page loads without error", async ({ page }) => {
    const response = await page.goto(`${consoleUrl}/dashboard/apps`);
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toContainText("Application error");
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

// ─── Instance Management ──────────────────────────────────────────────────────

test.describe("Console: instance management", () => {
  test.beforeEach(async ({ page }) => {
    await signInToConsole(page);
  });

  test("new instance page shows the creation form", async ({ page }) => {
    await page.goto(`${consoleUrl}/dashboard/new`);
    await expect(page).not.toHaveTitle(/error|500/i);
    await expect(page.locator("#display-name")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#slug")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("#admin-email")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('input[name="tier"]').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 5_000 });
  });

  test("new instance form shows correct labels and tier options", async ({ page }) => {
    await page.goto(`${consoleUrl}/dashboard/new`);
    await expect(page.locator("text=Platform name")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Slug")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Admin email")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Resource tier")).toBeVisible({ timeout: 5_000 });
    // Use exact=true to avoid substring matches ("Pro" matching "Provisioned")
    await expect(page.getByText("Free", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Pro", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Team", { exact: true }).first()).toBeVisible();
  });

  test("slug auto-generates from platform name input", async ({ page }) => {
    await page.goto(`${consoleUrl}/dashboard/new`);
    await page.locator("#display-name").fill("My Test Platform");
    await page.locator("#display-name").blur();
    await page.waitForTimeout(300);
    const slugValue = await page.locator("#slug").inputValue();
    expect(slugValue).toBe("my-test-platform");
  });

  test("instance creation respects tier limits", async ({ page }) => {
    // opadmin may be at the free tier limit. This test validates that:
    // - If at limit: user-friendly error is shown (not a crash)
    // - If under limit: creation succeeds and navigates to instance detail
    await page.goto(`${consoleUrl}/dashboard/new`);

    const ts = Date.now().toString().slice(-6);
    await page.locator("#display-name").fill(`E2E Test ${ts}`);
    await page.locator("#slug").fill(`e2e-${ts}`);

    // Focus the email field to auto-populate from session, then ensure it has a value
    await page.locator("#admin-email").focus();
    await page.waitForTimeout(300);
    let email = await page.locator("#admin-email").inputValue();
    if (!email) {
      await page.locator("#admin-email").fill(`test-${ts}@dev.test`);
      email = `test-${ts}@dev.test`;
    }

    await page.locator('button[type="submit"]').click();

    // Wait for the API response — either the error appears or the page navigates
    // Use waitForFunction to poll until either an error or URL change occurs
    await page.waitForFunction(
      () => {
        const url = window.location.href;
        if (!url.includes("/new")) return true; // navigated away
        const body = document.body.textContent || "";
        if (body.includes("limit reached") || body.includes("Something went wrong")) return true;
        return false;
      },
      { timeout: 10_000 }
    );

    const url = page.url();
    if (url.includes("/new")) {
      // Tier limit enforced — verify user-friendly error
      const body = await page.locator("body").textContent();
      expect(body).toContain("limit reached");
      await expect(page.locator("body")).not.toContainText("Application error");
    } else {
      // Instance created successfully
      expect(url).toContain("/dashboard/");
    }
  });

  test("dashboard shows instance list without error", async ({ page }) => {
    await page.goto(`${consoleUrl}/dashboard`);
    await page.waitForTimeout(1_000);
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });
});

// ─── Form Validation ──────────────────────────────────────────────────────────

test.describe("Console: form validation", () => {
  test.beforeEach(async ({ page }) => {
    await signInToConsole(page);
    await page.goto(`${consoleUrl}/dashboard/new`);
  });

  test("empty form submit shows validation errors", async ({ page }) => {
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(500);
    expect(page.url()).toContain("/new");
    const errorVisible = await page.locator(".form-error").first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(errorVisible, "Form errors should appear on empty submit").toBe(true);
  });

  test("name shorter than 2 chars shows length error", async ({ page }) => {
    await page.locator("#display-name").fill("a");
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator("text=2-64 characters")).toBeVisible({ timeout: 3_000 });
  });

  test("slug too short shows format error", async ({ page }) => {
    await page.locator("#display-name").fill("Test Platform");
    await page.locator("#slug").fill("ab"); // 2 chars — regex requires min 3
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator(".form-error").first()).toBeVisible({ timeout: 3_000 });
  });

  test("slug strips invalid chars and lowercases", async ({ page }) => {
    const slugInput = page.locator("#slug");
    await slugInput.fill("HAS SPACES & Special!");
    await slugInput.blur();
    await page.waitForTimeout(300);
    const value = await slugInput.inputValue();
    expect(value).toMatch(/^[a-z0-9-]*$/);
    expect(value).not.toContain(" ");
    expect(value).not.toContain("&");
  });

  test("email without valid domain shows validation error", async ({ page }) => {
    await page.locator("#display-name").fill("Valid Name");
    await page.locator("#slug").fill("valid-slug-test");
    // The email field has type="email" which applies browser-native validation.
    // Use an address with @ but no TLD — passes some browser validators but
    // fails the app's /^[^\s@]+@[^\s@]+\.[^\s@]+$/ regex (no dot in domain).
    // We bypass native constraint validation via noValidate to exercise the
    // React-side field error path.
    await page.locator("#admin-email").focus();
    await page.waitForTimeout(200);
    await page.locator("#admin-email").clear();
    await page.locator("#admin-email").fill("notanemail");
    await page.waitForTimeout(100);
    // Bypass browser's native constraint validation so React validate() fires
    await page.evaluate(() => {
      const form = document.querySelector("form") as HTMLFormElement;
      if (form) {
        form.noValidate = true;
        form.requestSubmit();
      }
    });
    await page.waitForTimeout(500);
    // validate() checks /^[^\s@]+@[^\s@]+\.[^\s@]+$/ — "notanemail" has no @
    await expect(page.locator("text=Valid email required")).toBeVisible({ timeout: 3_000 });
  });
});

// ─── API Endpoints ────────────────────────────────────────────────────────────

test.describe("Console: API endpoints", () => {
  test.beforeEach(async ({ page }) => {
    await signInToConsole(page);
  });

  test("GET /api/instances returns { instances: [...] } shape", async ({ page, request }) => {
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const response = await request.get(`${consoleUrl}/api/instances`, {
      headers: { Cookie: cookieHeader },
    });
    expect(response.status(), "Should be 200 for authenticated user").toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("instances");
    expect(Array.isArray(body.instances)).toBe(true);
  });

  test("GET /api/platform/services returns platform services", async ({ page, request }) => {
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const response = await request.get(`${consoleUrl}/api/platform/services`, {
      headers: { Cookie: cookieHeader },
    });
    expect(response.status()).not.toBe(500);
    if (response.status() === 200) {
      const body = await response.json();
      // Response shape: { services: Array }
      expect(body).toHaveProperty("services");
      expect(Array.isArray(body.services)).toBe(true);
      const names = body.services.map((s: { name: string }) => s.name);
      expect(names).toContain("Forgejo");
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
      // Response shape: { apps: Array, orgs: Array }
      expect(body).toHaveProperty("apps");
      expect(Array.isArray(body.apps)).toBe(true);
    }
  });

  test("GET /api/role returns admin role for opadmin", async ({ page, request }) => {
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

  // Unauthenticated tests: clear the session cookie before making the request.
  // We verify that requests WITHOUT the better-auth session cookie return 401.
  test("GET /api/instances without session returns 401", async ({ page, request }) => {
    // Get all cookies except the session token
    const allCookies = await page.context().cookies();
    const noSessionCookies = allCookies
      .filter((c) => c.name !== "__Secure-better-auth.session_token")
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const response = await request.get(`${consoleUrl}/api/instances`, {
      headers: { Cookie: noSessionCookies },
    });
    expect(response.status()).toBe(401);
  });

  test("GET /api/platform/users without session returns 401", async ({ page, request }) => {
    const allCookies = await page.context().cookies();
    const noSessionCookies = allCookies
      .filter((c) => c.name !== "__Secure-better-auth.session_token")
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const response = await request.get(`${consoleUrl}/api/platform/users`, {
      headers: { Cookie: noSessionCookies },
    });
    expect(response.status()).toBe(401);
  });

  test("POST /api/instances without session returns 401", async ({ page, request }) => {
    const allCookies = await page.context().cookies();
    const noSessionCookies = allCookies
      .filter((c) => c.name !== "__Secure-better-auth.session_token")
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const response = await request.post(`${consoleUrl}/api/instances`, {
      headers: { Cookie: noSessionCookies },
      data: { slug: "test-slug-x9", display_name: "Test Hacked", tier: "free" },
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
      `${consoleUrl}/dashboard/users`,
      `${consoleUrl}/dashboard`,
    ];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("body")).not.toContainText("Application error");
      await expect(page.locator("body")).not.toContainText("Internal Server Error");
    }
  });

  test("browser back/forward navigation works without errors", async ({ page }) => {
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

  test("unknown /dashboard route returns gracefully, not 500", async ({ page }) => {
    const response = await page.goto(`${consoleUrl}/dashboard/nonexistent-slug-xyz`);
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});
