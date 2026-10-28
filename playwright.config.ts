import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Real clipboard tests share the OS clipboard, so run them serially.
  workers: 1,
  timeout: 30000,
  reporter: [["list"], ["html", { outputFolder: "outputs/playwright-report", open: "never" }]],
  outputDir: "outputs/playwright-results",
  use: { baseURL: "http://127.0.0.1:5174", channel: process.env.PLAYWRIGHT_CHANNEL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } },
    { name: "mobile-chromium", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "node node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .wrangler/browser-tests --ip 127.0.0.1 --port 5174 --inspector-port 0",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    timeout: 90000,
    env: { OPEN_EXCHANGE_RATES_APP_ID: "", WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false", CLOUDFLARE_CF_FETCH_ENABLED: "false", NO_PROXY: "localhost,127.0.0.1" },
  },
});
