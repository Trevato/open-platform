import { test, expect } from "@playwright/test";

const BASE_URL = "https://console.open-platform.sh";
const USERNAME = "trevato";
const PASSWORD =
  "4f7da88496825ca67fefdd7c59e5684368a6710b9d495f680472fa7636b45ab3";

test("Debug: trace full login flow", async ({ page }) => {
  test.setTimeout(60000);

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      console.log("  navigated to:", frame.url());
    }
  });

  await page.goto(BASE_URL);
  await page.screenshot({ path: "/tmp/debug-1-landing.png" });

  // Nav button
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Get Started" })
    .click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "/tmp/debug-2-after-click.png" });
  console.log("  After click:", page.url());

  // Wait for Forgejo
  await page.waitForURL(/forgejo\.open-platform\.sh/, { timeout: 15000 });
  await page.screenshot({ path: "/tmp/debug-3-forgejo.png" });
  console.log("  On Forgejo:", page.url());

  // Fill and submit
  await page.fill('input[name="user_name"]', USERNAME);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForTimeout(3000);
  await page.screenshot({ path: "/tmp/debug-4-after-signin.png" });
  console.log("  After signin:", page.url());

  // See what buttons/forms are present
  const buttons = await page
    .locator("button, input[type='submit']")
    .allTextContents();
  console.log("  Buttons present:", buttons);

  const forms = await page.locator("form").count();
  console.log("  Forms present:", forms);

  // Wait for another navigation
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "/tmp/debug-5-final.png" });
  console.log("  Final URL:", page.url());

  const bodyText = await page.locator("body").textContent();
  console.log("  Body text (first 500):", bodyText?.slice(0, 500));
});
