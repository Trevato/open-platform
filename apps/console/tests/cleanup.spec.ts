import { test } from "@playwright/test";

const BASE_URL = "https://console.open-platform.sh";
const USERNAME = "trevato";
const PASSWORD =
  "4f7da88496825ca67fefdd7c59e5684368a6710b9d495f680472fa7636b45ab3";

async function login(page: any) {
  await page.goto(BASE_URL);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Get Started" })
    .click();
  await page.waitForURL(/forgejo\.open-platform\.sh/, { timeout: 15000 });
  if (page.url().includes("/user/login")) {
    await page.fill('input[name="user_name"]', USERNAME);
    await page.fill('input[name="password"]', PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForTimeout(2000);
  }
  if (page.url().includes("/login/oauth/authorize")) {
    await page.getByRole("button", { name: "Authorize Application" }).click();
  }
  await page.waitForURL(/console\.open-platform\.sh/, { timeout: 15000 });
}

test("Cleanup: delete tester agent if it exists", async ({ page }) => {
  test.setTimeout(30000);
  await login(page);

  await page.goto(`${BASE_URL}/dashboard/agents/tester`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);

  const bodyText = await page.locator("body").textContent();
  const onTesterPage =
    bodyText?.includes("Tester") || bodyText?.toLowerCase().includes("tester");

  if (!onTesterPage) {
    console.log("  Tester agent not found — nothing to clean up");
    return;
  }

  console.log("  Tester agent found — deleting...");

  // Delete via the API call that the UI makes
  const deleteBtn = page.getByRole("button", { name: /delete agent/i });
  await deleteBtn.click();
  await page.waitForTimeout(500);

  // Look for confirmation
  const confirmBtn = page
    .getByRole("button", { name: /^confirm$/i })
    .or(page.getByRole("button", { name: /^yes$/i }))
    .or(page.getByRole("button", { name: /^delete$/i }).last());

  if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmBtn.click();
  }

  await page
    .waitForURL(/\/dashboard\/agents$/, { timeout: 10000 })
    .catch(() => {});
  await page.waitForLoadState("networkidle");
  console.log("  Cleanup done. URL:", page.url());

  await page.screenshot({ path: "/tmp/cleanup-done.png" });
});
