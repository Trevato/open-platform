import { defineConfig, devices } from "@playwright/test";

const domain = process.env.PLATFORM_DOMAIN || "open-platform.sh";
const prefix = process.env.SERVICE_PREFIX || "";
const tlsSkip = process.env.TLS_SKIP_VERIFY !== "false"; // default: true

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  retries: 1,
  use: {
    ignoreHTTPSErrors: tlsSkip,
    baseURL: `https://${prefix}forgejo.${domain}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "platform",
      testDir: "./platform",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/state.json",
      },
    },
    {
      name: "apps",
      testDir: "./apps",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/state.json",
      },
    },
  ],
});
