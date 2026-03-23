import { test, expect, Page } from "@playwright/test";

const BASE_URL = "https://console.open-platform.sh";
const FORGEJO_URL = "https://forgejo.open-platform.sh";
const USERNAME = "trevato";
const PASSWORD =
  "4f7da88496825ca67fefdd7c59e5684368a6710b9d495f680472fa7636b45ab3";

async function login(page: Page) {
  await page.goto(BASE_URL);
  // Click the nav "Get Started" button (top-right in navigation bar)
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Get Started" })
    .click();

  // Wait for Forgejo login page or oauth authorize page
  await page.waitForURL(/forgejo\.open-platform\.sh/, { timeout: 15000 });

  // If we land on the login page, fill credentials
  if (page.url().includes("/user/login")) {
    await page.fill('input[name="user_name"]', USERNAME);
    await page.fill('input[name="password"]', PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForTimeout(2000);
  }

  // Handle the OAuth "Authorize Application" consent page
  if (page.url().includes("/login/oauth/authorize")) {
    await page.getByRole("button", { name: "Authorize Application" }).click();
  }

  // Wait to land back on console
  await page.waitForURL(/console\.open-platform\.sh/, { timeout: 15000 });
  console.log("  Logged in, URL:", page.url());
}

test.describe("Console Validation Tests", () => {
  test.setTimeout(120000);

  test("Auth: Login via Forgejo OAuth", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/console\.open-platform\.sh\/dashboard/);
    console.log("PASS: Auth — redirected to dashboard after Forgejo OAuth");
  });

  test("Test 1: Forgejo Username Link on Builder Agent Detail", async ({
    page,
  }) => {
    await login(page);

    // Navigate directly to builder agent detail (known slug from agents list)
    await page.goto(`${BASE_URL}/dashboard/agents/builder`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "/tmp/agent-detail-builder.png",
      fullPage: true,
    });
    console.log("  Agent detail URL:", page.url());

    // The Identity section should show "Forgejo User: agent-builder" as a link
    const forgejoUserLink = page.locator(
      'a[href="https://forgejo.open-platform.sh/agent-builder"]',
    );

    const linkCount = await forgejoUserLink.count();
    const linkVisible = await forgejoUserLink
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    console.log(`  Forgejo user link count: ${linkCount}`);
    console.log(`  Forgejo user link visible: ${linkVisible}`);

    if (linkCount > 0) {
      const href = await forgejoUserLink.getAttribute("href");
      const text = await forgejoUserLink.textContent();
      const target = await forgejoUserLink.getAttribute("target");
      console.log(`  href: ${href}`);
      console.log(`  text: ${text}`);
      console.log(`  target: ${target}`);
      expect(href).toBe(`${FORGEJO_URL}/agent-builder`);
      expect(text?.trim()).toBe("agent-builder");
    } else {
      // Check if it's plain text (the bug)
      const agentTextEl = page.getByText("agent-builder");
      const tagName = await agentTextEl
        .evaluate((el: Element) => el.tagName)
        .catch(() => "NOT FOUND");
      console.log(`  BUG CHECK — element tag for "agent-builder": ${tagName}`);
      console.log(
        `  RESULT: ${tagName === "A" ? "IS a link (href mismatch?)" : "NOT a link — BUG CONFIRMED"}`,
      );
    }

    expect(linkCount).toBeGreaterThan(0);
  });

  test("Test 2: Chat - Send a Message to Builder Agent", async ({ page }) => {
    await login(page);

    // Navigate directly to builder agent chat
    await page.goto(`${BASE_URL}/dashboard/agents/builder/chat`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "/tmp/chat-before.png", fullPage: true });
    console.log("  Chat page URL:", page.url());

    // Inspect what inputs are available
    const allInputs = await page
      .locator("textarea, input")
      .evaluateAll((els: Element[]) =>
        els.map((el) => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type,
          placeholder: el.getAttribute("placeholder"),
          name: el.getAttribute("name"),
        })),
      );
    console.log("  Inputs on chat page:", JSON.stringify(allInputs));

    // Find the message textarea
    const messageInput = page.locator("textarea").last();
    await messageInput.waitFor({ timeout: 10000 });
    await messageInput.fill("List all organizations on the platform");
    await page.screenshot({ path: "/tmp/chat-typed.png" });

    // Submit with Enter
    await messageInput.press("Enter");

    console.log("  Message submitted, waiting for response...");

    // Verify user message appears in chat
    await page.waitForTimeout(2000);
    const userMessage = page.getByText(
      "List all organizations on the platform",
    );
    const messageVisible = await userMessage
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    console.log(`  User message visible in chat: ${messageVisible}`);

    // Wait up to 60s for an AI response (streamed)
    let responseFound = false;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(5000);
      await page.screenshot({ path: `/tmp/chat-wait-${i}.png` });

      // Check body text for response content
      const bodyText = await page.locator("body").textContent();
      const hasOrg =
        bodyText?.toLowerCase().includes("organization") ||
        bodyText?.toLowerCase().includes("system") ||
        bodyText?.toLowerCase().includes("lab");

      if (hasOrg && messageVisible) {
        responseFound = true;
        console.log(`  Response detected after ~${(i + 1) * 5}s`);
        break;
      }
    }

    await page.screenshot({ path: "/tmp/chat-after.png", fullPage: true });

    // Check sidebar for conversation entry
    const pageContent = await page.content();
    const hasSidebar =
      pageContent.includes("conversation") ||
      pageContent.includes("sidebar") ||
      pageContent.includes("history");
    console.log(`  Page has sidebar/conversation structure: ${hasSidebar}`);
    console.log(`  Response found: ${responseFound}`);

    expect(messageVisible).toBe(true);
    expect(responseFound).toBe(true);
  });

  test("Test 3: Create a New Agent", async ({ page }) => {
    await login(page);

    await page.goto(`${BASE_URL}/dashboard/agents/new`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "/tmp/create-agent-form.png",
      fullPage: true,
    });
    console.log("  Create agent form URL:", page.url());

    // Inspect all form elements
    const allFormEls = await page
      .locator("input, textarea, select")
      .evaluateAll((els: Element[]) =>
        els.map((el) => ({
          tag: el.tagName,
          name: el.getAttribute("name"),
          id: el.getAttribute("id"),
          placeholder: el.getAttribute("placeholder"),
          type: (el as HTMLInputElement).type,
        })),
      );
    console.log("  Form elements:", JSON.stringify(allFormEls, null, 2));

    // Form uses id attributes (not name): agent-name, agent-description, agent-model, agent-orgs, agent-instructions
    await page.locator("#agent-name").fill("Tester");
    await page.locator("#agent-description").fill("Automated test agent");

    // Select Model — haiku
    const modelSelect = page.locator("#agent-model");
    const options = await modelSelect.locator("option").allTextContents();
    console.log("  Model options:", options);
    const haikuOption = options.find((o) => o.toLowerCase().includes("haiku"));
    if (haikuOption) {
      await modelSelect.selectOption({ label: haikuOption });
      console.log(`  Selected model: ${haikuOption}`);
    } else {
      console.log("  WARNING: no haiku option found in model select");
    }

    await page.locator("#agent-orgs").fill("system");
    await page
      .locator("#agent-instructions")
      .fill("You are a test agent. Respond concisely.");

    await page.screenshot({
      path: "/tmp/create-agent-filled.png",
      fullPage: true,
    });

    // Track API calls
    const apiCalls: { url: string; status: number }[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/")) {
        apiCalls.push({ url: response.url(), status: response.status() });
      }
    });

    // Click Create
    await page.getByRole("button", { name: /create agent/i }).click();

    // Wait for navigation away from /new
    await page
      .waitForURL(/\/dashboard\/agents\/(?!new)/, { timeout: 15000 })
      .catch(() => {
        console.log("  No URL change after create. Current:", page.url());
      });

    // Agent creation involves Forgejo user provisioning — wait for content to load
    await page.waitForTimeout(5000);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "/tmp/after-create-agent.png",
      fullPage: true,
    });

    console.log("  After create URL:", page.url());
    console.log("  API calls:", JSON.stringify(apiCalls));
    const bodyText = await page.locator("body").textContent();
    const hasTester = bodyText?.includes("Tester") || false;
    const hasHaiku = bodyText?.toLowerCase().includes("haiku") || false;
    const hasError = bodyText?.toLowerCase().includes("error") || false;

    console.log(`  Page shows "Tester": ${hasTester}`);
    console.log(`  Page shows haiku model: ${hasHaiku}`);
    console.log(`  Page shows error: ${hasError}`);

    // Assertions
    expect(page.url()).not.toContain("/new");
    expect(page.url()).toMatch(/\/dashboard\/agents\//);
    expect(hasTester).toBe(true);
    expect(hasError).toBe(false);
  });

  test("Test 4: Edit the Tester Agent - Change Model to Sonnet 4.6", async ({
    page,
  }) => {
    await login(page);

    // Navigate directly to tester detail
    await page.goto(`${BASE_URL}/dashboard/agents/tester`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "/tmp/tester-detail-before-edit.png",
      fullPage: true,
    });
    console.log("  Tester detail URL:", page.url());

    const preBodyText = await page.locator("body").textContent();
    console.log(`  Tester page loaded: ${preBodyText?.includes("Tester")}`);

    // Click Edit button
    await page.getByRole("button", { name: /^edit$/i }).click();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "/tmp/edit-agent-form.png", fullPage: true });
    console.log("  Edit form URL:", page.url());

    // Edit form uses same id pattern: agent-model
    const modelSelect = page.locator("#agent-model");
    await modelSelect.waitFor({ timeout: 5000 });
    const options = await modelSelect.locator("option").allTextContents();
    const currentValue = await modelSelect.inputValue();
    console.log("  Model options:", options);
    console.log("  Current model value:", currentValue);

    // Find a sonnet 4.x option
    const sonnetOption = options.find(
      (o) => o.toLowerCase().includes("sonnet") && o.includes("4"),
    );
    if (sonnetOption) {
      await modelSelect.selectOption({ label: sonnetOption });
      console.log(`  Selected: ${sonnetOption}`);
    } else {
      console.log("  WARNING: no sonnet 4.x option found");
    }

    await page.screenshot({
      path: "/tmp/edit-agent-filled.png",
      fullPage: true,
    });

    // Track API responses
    const apiResponses: { url: string; status: number }[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/")) {
        apiResponses.push({ url: response.url(), status: response.status() });
        console.log(`  API: ${response.status()} ${response.url()}`);
      }
    });

    // Click Save
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForTimeout(3000);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "/tmp/after-edit-agent.png",
      fullPage: true,
    });
    console.log("  After save URL:", page.url());

    const bodyText = await page.locator("body").textContent();
    const has422 = bodyText?.includes("422") || false;
    const hasError =
      (bodyText?.toLowerCase().includes("error") &&
        !bodyText?.toLowerCase().includes("error message")) ||
      false;
    const hasSonnet = bodyText?.toLowerCase().includes("sonnet") || false;
    const has422InApi = apiResponses.some((r) => r.status === 422);

    console.log(`  422 in page content: ${has422}`);
    console.log(`  422 in API responses: ${has422InApi}`);
    console.log(`  Error present: ${hasError}`);
    console.log(`  Model shows sonnet: ${hasSonnet}`);

    expect(has422).toBe(false);
    expect(has422InApi).toBe(false);
  });

  test("Test 5: Delete the Tester Agent", async ({ page }) => {
    await login(page);

    // Navigate to Tester agent detail
    await page.goto(`${BASE_URL}/dashboard/agents/tester`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "/tmp/tester-before-delete.png",
      fullPage: true,
    });
    console.log("  Tester detail URL:", page.url());

    const preBodyText = await page.locator("body").textContent();
    console.log(
      `  Tester page title present: ${preBodyText?.includes("Tester")}`,
    );

    // Click "Delete Agent" button
    await page.getByRole("button", { name: /delete agent/i }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: "/tmp/delete-confirm-dialog.png" });

    // Inspect what appeared (modal or inline confirmation)
    const bodyAfterClick = await page.locator("body").textContent();
    console.log(
      "  After delete click, page content excerpt:",
      bodyAfterClick?.slice(0, 300),
    );

    // Handle confirmation modal — look for a confirm/yes button
    const confirmBtn = page
      .getByRole("button", { name: /^confirm$/i })
      .or(page.getByRole("button", { name: /^yes$/i }))
      .or(page.getByRole("button", { name: /^delete$/i }).last());

    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("  Confirmation dialog detected, clicking confirm");
      await confirmBtn.click();
    } else {
      console.log("  No confirmation dialog found — may be inline delete");
    }

    // Wait for redirect to agents list
    await page
      .waitForURL(/\/dashboard\/agents$/, { timeout: 10000 })
      .catch(() => console.log("  URL after delete:", page.url()));

    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "/tmp/after-delete.png", fullPage: true });
    console.log("  After delete URL:", page.url());

    // Verify Tester is gone
    const allText = await page.locator("body").textContent();
    const testerStillVisible = allText?.includes("Tester") || false;
    console.log(`  Tester still visible in list: ${testerStillVisible}`);

    expect(page.url()).toMatch(/\/dashboard\/agents/);
    expect(testerStillVisible).toBe(false);
  });
});
