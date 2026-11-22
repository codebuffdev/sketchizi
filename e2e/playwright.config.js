import { defineConfig, devices } from "@playwright/test";

// Minimal browser smoke config. Run from the repo root: npm run test:e2e
// First time only: npx --prefix e2e playwright install chromium
// Playwright lives in e2e/package.json so the root lockfile (and CI "npm ci") are unaffected.
export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "npm run dev --prefix .. -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
