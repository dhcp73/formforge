import { defineConfig, devices } from "@playwright/test";

const BASE = process.env.FORMFORGE_URL || "http://127.0.0.1:3100";
/** Functional end-to-end tests. Expects the app on :3100 (npm run start:all) or starts `npm run start`. */
export default defineConfig({
  testDir: "e2e",
  testIgnore: ["ui/**"],
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 2,
  retries: 0,
  timeout: 45_000,
  reporter: [["list"], ["html", { outputFolder: "reports/e2e", open: "never" }], ["json", { outputFile: "reports/e2e/results.json" }]],
  use: { baseURL: BASE, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "npm run start", url: `${BASE}/api/health`, reuseExistingServer: true, timeout: 120_000 },
});
