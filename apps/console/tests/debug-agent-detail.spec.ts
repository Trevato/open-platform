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

test("Debug: inspect agent detail page DOM", async ({ page }) => {
  test.setTimeout(30000);
  await login(page);

  // Go directly to builder detail
  await page.goto(`${BASE_URL}/dashboard/agents/builder`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  console.log("URL:", page.url());

  // Find the agent-builder element and inspect it
  const agentBuilderEl = page.getByText("agent-builder");
  const count = await agentBuilderEl.count();
  console.log("agent-builder elements:", count);

  for (let i = 0; i < count; i++) {
    const el = agentBuilderEl.nth(i);
    const tagName = await el.evaluate((node: Element) => node.tagName);
    const href = await el.getAttribute("href");
    const outerHTML = await el.evaluate((node: Element) => node.outerHTML);
    console.log(`  [${i}] tag=${tagName}, href=${href}`);
    console.log(`  [${i}] outerHTML=${outerHTML}`);
  }

  // Get all <a> tags and their hrefs
  const allAnchors = await page
    .locator("a")
    .evaluateAll((els: Element[]) =>
      els.map((el) => ({
        text: el.textContent?.trim(),
        href: el.getAttribute("href"),
      })),
    );
  console.log("All anchors on page:", JSON.stringify(allAnchors, null, 2));
});
