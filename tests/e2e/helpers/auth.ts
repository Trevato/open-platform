import { Page } from "@playwright/test";
import { urls, admin } from "./config";

/**
 * Logs into Forgejo via the browser login form.
 * After this, the page has a session cookie that works for OAuth2/OIDC flows.
 */
export async function forgejoLogin(page: Page): Promise<void> {
  await page.goto(`${urls.forgejo}/user/login`);
  await page.fill('input[name="user_name"]', admin.username);
  await page.fill('input[name="password"]', admin.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL("**/", { timeout: 15_000 });
}

/**
 * Handles the Forgejo OAuth2 grant page if it appears during an OAuth flow.
 * Returns true if a grant page was handled, false if already authorized.
 */
export async function handleGrantPage(page: Page): Promise<boolean> {
  // Check if we're on the grant authorization page
  const grantButton = page.locator(
    'button:has-text("Authorize"), button:has-text("Grant Access"), input[type="submit"][value*="rant"]'
  );

  try {
    await grantButton.first().waitFor({ timeout: 3_000 });
    await grantButton.first().click();
    return true;
  } catch {
    return false; // No grant page — already authorized
  }
}
