import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 40 * 60 * 1000, // 40 min total
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "https://projpul.com",
    headless: true, // set false locally to watch
    viewport: { width: 1440, height: 900 },
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    video: {
      mode: "on",
      size: { width: 1440, height: 900 },
    },
    trace: "on",
    screenshot: "off",
    launchOptions: {
      slowMo: 600,
    },
  },
  outputDir: "output/playwright",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
