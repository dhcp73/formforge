import { test, expect } from "@playwright/test";
import { DEMO } from "./support";

/** Primary regression: after login, dashboard/forms must never bounce to /login across reloads. */
const PAGES = [
  "/dashboard",
  "/dashboard/forms",
  "/dashboard/forms/ffDemoSale",
  "/dashboard/forms/ffDemoSale/setup",
  "/dashboard/forms/ffDemoSale/settings",
  "/dashboard/forms/ffDemoSale/automations",
  "/dashboard/forms/ffDemoBeta",
  "/dashboard/leads",
  "/dashboard/routing",
  "/dashboard/api-keys",
  "/dashboard/settings",
];

test("demo login survives hard reloads on forms pages", async ({ page, context, browser }) => {
  test.setTimeout(180_000);
  const base = process.env.FORMFORGE_URL || "http://127.0.0.1:3100";
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

  for (let round = 0; round < 3; round++) {
    for (const path of PAGES) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page, `round ${round} ${path}`).not.toHaveURL(/\/login/);
    }
  }

  const state = await context.storageState();
  const ctx2 = await browser.newContext({ storageState: state });
  const page2 = await ctx2.newPage();
  await page2.goto(`${base}/dashboard/forms`);
  await expect(page2).not.toHaveURL(/\/login/);
  await expect(page2.getByRole("heading", { name: "Forms" })).toBeVisible();
  await page2.goto(`${base}/dashboard/forms/ffDemoSale/settings`);
  await expect(page2).not.toHaveURL(/\/login/);
  await ctx2.close();
});
