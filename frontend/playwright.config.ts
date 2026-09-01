import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3777",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
  ],

  // Auto-start dev server when running tests locally.
  // Set SKIP_WEB_SERVER=1 to disable (e.g. if already running).
  webServer: process.env.SKIP_WEB_SERVER
    ? undefined
    : {
        command: "next dev -p 3777",
        url: "http://localhost:3777",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
