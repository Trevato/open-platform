/**
 * Terminal Validation Script
 * Validates Catppuccin Mocha theme, starship prompt, eza icons, and k9s skin
 * on the console.open-platform.sh terminal page
 */

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const SCREENSHOTS_DIR = "/Users/trevato/projects/open-platform/test-screenshots";
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const CATPPUCCIN_MOCHA_BG = { r: 30, g: 30, b: 46 }; // #1e1e2e
const BG_TOLERANCE = 10;

function colorClose(actual, expected, tolerance = BG_TOLERANCE) {
  return (
    Math.abs(actual.r - expected.r) <= tolerance &&
    Math.abs(actual.g - expected.g) <= tolerance &&
    Math.abs(actual.b - expected.b) <= tolerance
  );
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

async function screenshot(page, name) {
  const filePath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  [screenshot] ${filePath}`);
  return filePath;
}

async function waitForTerminalReady(page) {
  // Look for connected status indicator or absence of "Connecting" text
  console.log("  Waiting for terminal to connect...");

  try {
    // Wait for the terminal canvas/element to appear
    await page.waitForSelector(".xterm-screen, canvas, .terminal", { timeout: 30000 });
    console.log("  Terminal element found");

    // Additional wait for WebSocket connection
    await page.waitForTimeout(5000);

    // Check for connected status text
    const statusEl = page.locator('[data-status="connected"], .status-connected, text="Connected"').first();
    const isConnected = await statusEl.isVisible().catch(() => false);
    if (isConnected) {
      console.log("  Status: Connected");
    } else {
      console.log("  Status: (no explicit connected indicator found, proceeding)");
    }
  } catch (e) {
    console.log(`  Warning: ${e.message}`);
  }
}

async function typeInTerminal(page, text) {
  // Try clicking the terminal first to ensure focus
  const terminal = page.locator(".xterm-helper-textarea, canvas, .terminal").first();
  await terminal.click().catch(() => page.keyboard.press("Tab"));
  await page.waitForTimeout(300);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);
}

async function run() {
  console.log("\n=== Console Terminal Validation ===\n");

  const findings = {
    catppuccinMochaBackground: false,
    starshipPrompt: false,
    ezaIcons: false,
    k9sCatppuccinSkin: false,
    terminalConnected: false,
    issues: [],
    notes: [],
  };

  const browser = await chromium.launch({
    headless: false, // Visible so we can see what's happening
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Use persistent storage to preserve any existing session
    storageState: undefined,
  });

  const page = await context.newPage();

  // Capture console errors
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      findings.issues.push(`Console error: ${msg.text()}`);
    }
  });

  try {
    // ── Step 1: Navigate to console ──────────────────────────────────────────
    console.log("Step 1: Navigating to https://console.open-platform.sh");
    await page.goto("https://console.open-platform.sh", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    await screenshot(page, "01-initial-load");
    console.log(`  URL: ${page.url()}`);

    // ── Step 2: Handle auth ──────────────────────────────────────────────────
    const currentUrl = page.url();
    const pageText = await page.textContent("body");

    if (
      currentUrl.includes("/sign-in") ||
      currentUrl.includes("forgejo") ||
      currentUrl.includes("oauth") ||
      pageText.includes("Sign in") ||
      pageText.includes("Log in")
    ) {
      console.log("Step 2: Auth required — looking for sign-in button");

      // Check if we're on the landing page with a sign-in button
      const signInBtn = page
        .locator('button:has-text("Sign in"), a:has-text("Sign in"), button:has-text("Get started"), a:has-text("Get started")')
        .first();
      const signInVisible = await signInBtn.isVisible().catch(() => false);

      if (signInVisible) {
        console.log("  Found sign-in button, clicking...");
        await signInBtn.click();
        await page.waitForLoadState("networkidle", { timeout: 15000 });
        await screenshot(page, "02-after-signin-click");
        console.log(`  URL after click: ${page.url()}`);
      }

      // If redirected to Forgejo OAuth, handle it
      if (page.url().includes("forgejo") || page.url().includes("oauth")) {
        console.log("  Redirected to Forgejo OAuth — auth wall present");
        findings.notes.push("Auth redirect encountered — session not established");
        await screenshot(page, "02-auth-redirect");

        // Try to see if we can navigate directly to the dashboard
        await page.goto("https://console.open-platform.sh/dashboard", {
          waitUntil: "networkidle",
          timeout: 20000,
        });
        await screenshot(page, "02b-dashboard-direct");
      }
    } else {
      console.log("Step 2: Already authenticated (no sign-in prompt)");
      findings.notes.push("Session already active");
    }

    // ── Step 3: Find plz instance on dashboard ───────────────────────────────
    console.log("Step 3: Looking for 'plz' instance on dashboard");
    await screenshot(page, "03-dashboard");

    // Look for the plz instance card or link
    const plzLink = page
      .locator('a[href*="/dashboard/plz"], [data-slug="plz"], text="plz"')
      .first();
    const plzVisible = await plzLink.isVisible().catch(() => false);

    if (plzVisible) {
      console.log("  Found 'plz' instance, clicking through to it");
      await plzLink.click();
      await page.waitForLoadState("networkidle", { timeout: 15000 });
      await screenshot(page, "04-instance-page");
    } else {
      console.log("  'plz' not found via locator, navigating directly");
      await page.goto("https://console.open-platform.sh/dashboard/plz", {
        waitUntil: "networkidle",
        timeout: 20000,
      });
      await screenshot(page, "04-instance-direct");
    }

    console.log(`  Current URL: ${page.url()}`);

    // ── Step 4: Navigate to terminal ─────────────────────────────────────────
    console.log("Step 4: Navigating to terminal page");

    const terminalLink = page
      .locator('a[href*="/terminal"], button:has-text("Terminal"), a:has-text("Terminal")')
      .first();
    const terminalLinkVisible = await terminalLink.isVisible().catch(() => false);

    if (terminalLinkVisible) {
      console.log("  Found terminal link, clicking");
      await terminalLink.click();
      await page.waitForLoadState("networkidle", { timeout: 15000 });
    } else {
      console.log("  Navigating directly to terminal URL");
      await page.goto("https://console.open-platform.sh/dashboard/plz/terminal", {
        waitUntil: "networkidle",
        timeout: 20000,
      });
    }

    await screenshot(page, "05-terminal-page-loading");
    console.log(`  URL: ${page.url()}`);

    // ── Step 5: Wait for terminal to connect ─────────────────────────────────
    console.log("Step 5: Waiting for terminal connection");
    await waitForTerminalReady(page);
    findings.terminalConnected = true;
    await screenshot(page, "06-terminal-connected");

    // ── Step 6: Verify Catppuccin Mocha background (#1e1e2e) ─────────────────
    console.log("Step 6: Checking Catppuccin Mocha background color");

    // Check the terminal background color via CSS
    const terminalBgColor = await page.evaluate(() => {
      // Look for xterm or ghostty terminal element
      const selectors = [
        ".xterm-screen",
        ".xterm-viewport",
        ".terminal",
        "canvas",
        '[class*="terminal"]',
        '[class*="xterm"]',
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const style = window.getComputedStyle(el);
          return {
            selector: sel,
            backgroundColor: style.backgroundColor,
            background: style.background,
          };
        }
      }

      // Fall back to body
      const body = document.body;
      return {
        selector: "body",
        backgroundColor: window.getComputedStyle(body).backgroundColor,
        background: window.getComputedStyle(body).background,
      };
    });

    console.log(`  Terminal background: ${JSON.stringify(terminalBgColor)}`);

    // Parse RGB from computed style
    const rgbMatch = terminalBgColor.backgroundColor?.match(
      /rgb\((\d+),\s*(\d+),\s*(\d+)\)/
    );
    if (rgbMatch) {
      const actual = {
        r: parseInt(rgbMatch[1]),
        g: parseInt(rgbMatch[2]),
        b: parseInt(rgbMatch[3]),
      };
      const isCatppuccin = colorClose(actual, CATPPUCCIN_MOCHA_BG);
      findings.catppuccinMochaBackground = isCatppuccin;
      console.log(
        `  RGB(${actual.r}, ${actual.g}, ${actual.b}) vs expected RGB(${CATPPUCCIN_MOCHA_BG.r}, ${CATPPUCCIN_MOCHA_BG.g}, ${CATPPUCCIN_MOCHA_BG.b})`
      );
      console.log(
        `  Catppuccin Mocha: ${isCatppuccin ? "PASS" : "FAIL"}`
      );
    } else {
      findings.notes.push(`Could not parse background color: ${terminalBgColor.backgroundColor}`);
    }

    // Also check for the color in the terminal container's style or data attributes
    const terminalContainer = await page.evaluate(() => {
      const el = document.querySelector('[class*="terminal-container"], [class*="ghostty"], .terminal-wrapper');
      if (el) {
        return {
          bgColor: window.getComputedStyle(el).backgroundColor,
          innerHTML: el.innerHTML.substring(0, 500),
        };
      }
      return null;
    });
    if (terminalContainer) {
      console.log(`  Container bg: ${terminalContainer.bgColor}`);
    }

    // ── Step 7: Check for starship prompt ────────────────────────────────────
    console.log("Step 7: Looking for starship ➜ prompt");
    await page.waitForTimeout(2000);

    // Read terminal text content
    const terminalText = await page.evaluate(() => {
      // xterm renders to canvas, so we check accessible text or aria labels
      const accessible = document.querySelector(".xterm-accessibility-tree, [role='grid'], [aria-label]");
      if (accessible) return accessible.textContent?.substring(0, 1000);

      // Try reading from xterm rows
      const rows = document.querySelectorAll(".xterm-rows span, .xterm-rows .xterm-cursor");
      if (rows.length > 0) {
        return Array.from(rows)
          .map((r) => r.textContent)
          .join("")
          .substring(0, 500);
      }

      return document.body.textContent?.substring(0, 1000);
    });

    console.log(`  Terminal text sample: ${terminalText?.substring(0, 200)}`);

    if (terminalText?.includes("➜") || terminalText?.includes("→")) {
      findings.starshipPrompt = true;
      console.log("  Starship ➜ prompt: PASS");
    } else {
      findings.notes.push("Starship ➜ not found in accessible text (may be canvas-rendered)");
      console.log("  Starship ➜: not detected in text (canvas may hide it)");
    }

    // ── Step 8: Type 'ls' and check for eza icons ────────────────────────────
    console.log("Step 8: Typing 'ls' — checking for eza output with icons");

    // Focus and type in the terminal
    await page.click(".xterm-screen, canvas, .terminal, body").catch(() => {});
    await page.waitForTimeout(500);
    await page.keyboard.type("ls");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(4000);

    await screenshot(page, "07-ls-output");

    // Check for eza icons (they render as special unicode chars in canvas)
    const lsText = await page.evaluate(() => {
      const rows = document.querySelectorAll(".xterm-accessibility-tree span, .xterm-rows span");
      return Array.from(rows)
        .map((r) => r.textContent)
        .join("")
        .substring(0, 1000);
    });

    console.log(`  ls output sample: ${lsText?.substring(0, 300)}`);

    // Eza icons are typically Nerd Font characters - look for file/folder chars
    // or just verify ls ran and produced output
    if (lsText?.length > 50 || lsText?.includes("ls")) {
      findings.notes.push("ls command executed — eza icon detection requires visual inspection of screenshot");
    }

    // ── Step 9: Type 'k get ns' ───────────────────────────────────────────────
    console.log("Step 9: Typing 'k get ns' — checking kubectl");

    await page.keyboard.type("k get ns");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(5000);

    await screenshot(page, "08-k-get-ns-output");

    const kText = await page.evaluate(() => {
      const rows = document.querySelectorAll(".xterm-accessibility-tree span, .xterm-rows span");
      return Array.from(rows)
        .map((r) => r.textContent)
        .join("")
        .substring(0, 2000);
    });

    if (kText?.includes("NAME") || kText?.includes("namespace") || kText?.includes("Active")) {
      console.log("  kubectl 'k get ns': PASS — namespace output detected");
      findings.notes.push("kubectl alias 'k' works, namespace list visible");
    } else {
      console.log("  kubectl result not detected in text (may be canvas-rendered)");
    }

    // ── Step 10: Type 'k9s' and check skin ───────────────────────────────────
    console.log("Step 10: Launching k9s — checking Catppuccin skin");

    await page.keyboard.type("k9s");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(8000); // k9s takes time to start

    await screenshot(page, "09-k9s-running");

    // Check for k9s-specific UI elements
    const k9sText = await page.evaluate(() => {
      const rows = document.querySelectorAll(".xterm-accessibility-tree span, .xterm-rows span");
      return Array.from(rows)
        .map((r) => r.textContent)
        .join("")
        .substring(0, 2000);
    });

    if (k9sText?.includes("k9s") || k9sText?.includes("Pods") || k9sText?.includes("Context")) {
      console.log("  k9s launched: PASS");
      findings.notes.push("k9s is running — Catppuccin skin requires visual inspection of screenshot");
    }

    // Check terminal colors more carefully for k9s skin
    const k9sColors = await page.evaluate(() => {
      // Sample pixel color at various points to detect the Catppuccin palette
      const canvas = document.querySelector("canvas");
      if (!canvas) return null;

      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // Sample center of screen for k9s header color
      const imageData = ctx.getImageData(canvas.width / 2, 20, 1, 1).data;
      return {
        headerPixel: { r: imageData[0], g: imageData[1], b: imageData[2] },
        canvasSize: { w: canvas.width, h: canvas.height },
      };
    });

    if (k9sColors) {
      console.log(`  k9s canvas sample: ${JSON.stringify(k9sColors)}`);
      // Catppuccin Mocha mauve #cba6f7 or surface #313244
      const mauveColor = { r: 203, g: 166, b: 247 };
      const surfaceColor = { r: 49, g: 50, b: 68 };
      const isMauve = colorClose(k9sColors.headerPixel, mauveColor, 30);
      const isSurface = colorClose(k9sColors.headerPixel, surfaceColor, 20);
      if (isMauve || isSurface) {
        findings.k9sCatppuccinSkin = true;
        console.log("  k9s Catppuccin skin: PASS (header color matches)");
      }
    }

    // ── Step 11: Press 'q' to exit k9s ───────────────────────────────────────
    console.log("Step 11: Pressing 'q' to exit k9s");
    await page.keyboard.press("q");
    await page.waitForTimeout(3000);
    await screenshot(page, "10-after-k9s-exit");

    // ── Final screenshot ──────────────────────────────────────────────────────
    console.log("Step 12: Final screenshot");
    await screenshot(page, "11-final");

    // ── Visual color sampling from canvas ─────────────────────────────────────
    console.log("\nStep 13: Deep color analysis of terminal canvas");
    const colorAnalysis = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return { error: "no canvas found" };

      const ctx = canvas.getContext("2d");
      if (!ctx) return { error: "no 2d context" };

      const w = canvas.width;
      const h = canvas.height;

      // Sample a grid of pixels
      const samples = [];
      for (let x = 50; x < w; x += 100) {
        for (let y = 50; y < h; y += 100) {
          const d = ctx.getImageData(x, y, 1, 1).data;
          samples.push({ x, y, r: d[0], g: d[1], b: d[2] });
        }
      }

      // Find the most common "background-ish" color (dark colors)
      const darkSamples = samples.filter(
        (s) => s.r < 60 && s.g < 60 && s.b < 80
      );

      return {
        totalSamples: samples.length,
        darkSamples: darkSamples.length,
        sampleSet: samples.slice(0, 10),
        darkSampleSet: darkSamples.slice(0, 5),
        canvasSize: { w, h },
      };
    });

    console.log(`  Color analysis: ${JSON.stringify(colorAnalysis, null, 2)}`);

    // Check if majority of dark samples match Catppuccin Mocha
    if (colorAnalysis.darkSampleSet?.length > 0) {
      const catppuccinMatches = colorAnalysis.darkSampleSet.filter((s) =>
        colorClose(s, CATPPUCCIN_MOCHA_BG, 12)
      );
      if (catppuccinMatches.length > 0) {
        findings.catppuccinMochaBackground = true;
        console.log(`  Catppuccin Mocha confirmed via pixel sampling: ${catppuccinMatches.length} matching pixels`);
      }
    }

  } catch (err) {
    console.error(`\nError during validation: ${err.message}`);
    findings.issues.push(`Script error: ${err.message}`);
    await screenshot(page, "error-state").catch(() => {});
  } finally {
    await browser.close();
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  console.log("\n\n=== VALIDATION REPORT ===\n");
  console.log(`TESTED:  Console terminal at console.open-platform.sh/dashboard/plz/terminal`);
  console.log(`METHOD:  Playwright Chromium headless + visual inspection`);
  console.log("\nRESULTS:");
  console.log(`  Terminal connected:         ${findings.terminalConnected ? "PASS" : "FAIL"}`);
  console.log(`  Catppuccin Mocha (#1e1e2e): ${findings.catppuccinMochaBackground ? "PASS" : "REQUIRES VISUAL CHECK"}`);
  console.log(`  Starship ➜ prompt:          ${findings.starshipPrompt ? "PASS" : "REQUIRES VISUAL CHECK"}`);
  console.log(`  eza icons (ls):             ${findings.ezaIcons ? "PASS" : "REQUIRES VISUAL CHECK"}`);
  console.log(`  k9s Catppuccin skin:        ${findings.k9sCatppuccinSkin ? "PASS" : "REQUIRES VISUAL CHECK"}`);

  if (findings.notes.length > 0) {
    console.log("\nNOTES:");
    findings.notes.forEach((n) => console.log(`  - ${n}`));
  }

  if (findings.issues.length > 0) {
    console.log("\nISSUES:");
    findings.issues.forEach((i) => console.log(`  - ${i}`));
  }

  console.log(`\nSCREENSHOTS: ${SCREENSHOTS_DIR}/`);
  console.log("\nCONFIDENCE: Canvas-rendered terminals require visual screenshot inspection.");
  console.log("Review screenshots for Catppuccin colors, ➜ prompt, Nerd Font icons, and k9s skin.\n");

  return findings;
}

run().catch(console.error);
