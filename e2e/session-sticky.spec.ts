import { test, expect } from "@playwright/test";
import { DEMO } from "./support";

const DASH_PAGES = [
  "/dashboard",
  "/dashboard/forms",
  "/dashboard/leads",
  "/dashboard/routing",
  "/dashboard/enrichment",
  "/dashboard/integrations",
  "/dashboard/api-keys",
  "/dashboard/webhooks",
  "/dashboard/schedules",
  "/dashboard/settings",
  "/dashboard/outbox",
  "/dashboard/health",
];

const FORM_SUB = (id: string) => [
  `/dashboard/forms/${id}`,
  `/dashboard/forms/${id}/setup`,
  `/dashboard/forms/${id}/settings`,
  `/dashboard/forms/${id}/automations`,
];

test.describe.configure({ mode: "serial" });

test("login cookie sticks across hard reloads, form pages, and new contexts", async ({ page, context, browser }) => {
  test.setTimeout(240_000);
  const base = process.env.FORMFORGE_URL || "http://127.0.0.1:3100";

  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/login/);

  // Create a new form — must remain findable after reloads (snap cookie / localStorage)
  await page.goto("/dashboard/forms?new=1");
  await expect(page.getByRole("heading", { name: /Create a form/i })).toBeVisible({ timeout: 15_000 });
  const formName = `Sticky Form ${Date.now()}`;
  await page.getByLabel("Form name").fill(formName);
  await page.getByRole("button", { name: "Create form" }).click();
  await page.waitForURL(/\/dashboard\/forms\/[^/]+\/setup/, { timeout: 45_000 });
  await expect(page).not.toHaveURL(/\/login/);
  const createdId = page.url().match(/\/dashboard\/forms\/([^/?#]+)/)?.[1];
  expect(createdId).toBeTruthy();
  await expect(page.getByText(formName).first()).toBeVisible({ timeout: 20_000 });
  // Reload the form setup page — must stay authenticated and keep the form
  await page.reload();
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText(formName).first()).toBeVisible({ timeout: 30_000 });

  // Snapshot save on ?created=1 (skips stale restore), then list must show the form
  await page.waitForTimeout(2000);
  await page.goto("/dashboard/forms");
  await expect(page.getByText(formName).first()).toBeVisible({ timeout: 45_000 });
  await page.reload();
  await expect(page.getByText(formName).first()).toBeVisible({ timeout: 45_000 });

  const formId = createdId!;
  const paths = [...DASH_PAGES, ...FORM_SUB(formId), ...FORM_SUB("ffDemoSale")];
  for (let round = 0; round < 3; round++) {
    for (const path of paths) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page, `round ${round} ${path}`).not.toHaveURL(/\/login/);
      // Form detail may 404 if snap missing — still must not bounce to login
      expect(new URL(page.url()).pathname.startsWith("/login")).toBe(false);
    }
  }

  const state = await context.storageState();
  const ctx2 = await browser.newContext({ storageState: state });
  const page2 = await ctx2.newPage();
  await page2.goto(`${base}/dashboard/forms`);
  await expect(page2).not.toHaveURL(/\/login/);
  // Wait for client DemoPersistence restore + refresh (or snap cookie SSR)
  await expect(page2.getByText(formName).first()).toBeVisible({ timeout: 45_000 });
  await page2.goto(`${base}/dashboard/forms/${formId}/settings`);
  await expect(page2).not.toHaveURL(/\/login/);
  await expect(page2.getByRole("heading", { name: formName })).toBeVisible({ timeout: 30_000 });
  await ctx2.close();
});
