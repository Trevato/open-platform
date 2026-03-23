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

test("Debug: inspect delete confirmation flow", async ({ page }) => {
  test.setTimeout(30000);
  await login(page);

  await page.goto(`${BASE_URL}/dashboard/agents/tester`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  console.log("Before delete click:");
  const allBtns = await page.locator("button").allTextContents();
  console.log("  Buttons:", allBtns);

  await page.screenshot({ path: "/tmp/debug-delete-1-before.png" });

  // Click Delete Agent
  await page.getByRole("button", { name: /delete agent/i }).click();
  await page.waitForTimeout(1000);

  console.log("After delete click:");
  await page.screenshot({ path: "/tmp/debug-delete-2-after-click.png" });

  const allBtns2 = await page.locator("button").allTextContents();
  console.log("  Buttons after click:", allBtns2);

  const allText = await page.locator("body").textContent();
  console.log("  Body text excerpt (first 500):", allText?.slice(0, 500));

  // Inspect dialogs/modals
  const dialogs = await page
    .locator('[role="dialog"], [class*="modal"], [class*="dialog"]')
    .count();
  console.log("  Dialog/modal elements:", dialogs);

  // Try to find all visible elements with confirm/delete/yes text
  const confirmEls = await page
    .locator("button, a")
    .evaluateAll((els: Element[]) =>
      els
        .map((el) => ({
          text: el.textContent?.trim(),
          visible: (el as HTMLElement).offsetParent !== null,
        }))
        .filter((el) => el.text && el.text.length > 0),
    );
  console.log("  All buttons after click:", JSON.stringify(confirmEls));
});
