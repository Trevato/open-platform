import { test, expect } from "@playwright/test";
import { domain, prefix } from "../helpers/config";
import { execSync } from "child_process";

test.describe("Deployed apps respond", () => {
  // Discover app namespaces dynamically via kubectl
  let apps: string[] = [];

  test.beforeAll(async () => {
    try {
      const output = execSync(
        'kubectl get ns -l open-platform.sh/tier=workload -o jsonpath=\'{.items[*].metadata.labels.open-platform\\.sh/repo}\'',
        { encoding: "utf-8", timeout: 10_000 }
      ).trim();
      apps = output.split(/\s+/).filter(Boolean);
    } catch {
      // kubectl not available or no workload namespaces
      apps = [];
    }
  });

  test("at least one app is deployed", () => {
    expect(apps.length, "expected at least one workload namespace").toBeGreaterThan(0);
  });

  test("each app responds", async ({ page }) => {
    test.skip(apps.length === 0, "no apps discovered");

    for (const app of apps) {
      const url = `https://${prefix}${app}.${domain}`;
      const response = await page.goto(url);
      expect(
        response?.status(),
        `${app} at ${url} should respond`
      ).toBeLessThan(500);
    }
  });
});
