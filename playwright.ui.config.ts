import { defineConfig } from "@playwright/test";

const BASE = process.env.FORMFORGE_URL || "http://127.0.0.1:3100";
const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1440, height: 900 },
];
/** UI audit: every route × 4 viewports × light/dark. `npm run test:ui` */
export default defineConfig({
  testDir: "e2e/ui",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  workers: 4,
  timeout: 600_000,
  reporter: [["list"], ["html", { outputFolder: "reports/ui-test", open: "never" }], ["json", { outputFile: "reports/ui-test/results.json" }]],
  use: { baseURL: BASE },
  projects: VIEWPORTS.flatMap((v) => (["light", "dark"] as const).map((theme) => ({
    name: `${v.name}-${theme}`,
    use: { viewport: { width: v.width, height: v.height }, colorScheme: theme, isMobile: v.width < 500, hasTouch: v.width < 500 },
    metadata: { theme },
  }))),
  webServer: { command: "npm run start", url: `${BASE}/api/health`, reuseExistingServer: true, timeout: 120_000 },
});
