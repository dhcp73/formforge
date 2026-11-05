import { test, expect } from "@playwright/test";
import { ids } from "./support";

test("landing → pricing → docs navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(/\/pricing/);
  await page.goto("/docs");
  await page.getByRole("link", { name: "Quickstart" }).first().click();
  await expect(page).toHaveURL(/\/docs\/quickstart/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Quickstart/i);
});

test("interactive API reference renders the OpenAPI spec", async ({ page }) => {
  await page.goto("/docs/api");
  await expect(page.getByText("FormForge API", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "FormForge API" }).first()).toBeVisible({ timeout: 20_000 });
  await page.getByText("Forms", { exact: true }).first().click();
  await expect(page.getByText(/List forms/i).first()).toBeVisible({ timeout: 20_000 });
});

test("public status page shows live components", async ({ page }) => {
  await page.goto("/status");
  await expect(page.getByText(/Database/).first()).toBeVisible();
  await expect(page.getByText(/operational|degraded|outage/i).first()).toBeVisible();
});

test("hosted form: validation, branching logic and success", async ({ page }) => {
  await page.goto(`/f/${ids().schemaFormId}`);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText(/is required/).first()).toBeVisible();
  await expect(page.getByLabel(/Which role/)).toHaveCount(0);
  await page.getByLabel(/Your role/).selectOption("Other");
  await expect(page.getByLabel(/Which role/)).toBeVisible();
  await page.getByLabel(/Your role/).selectOption("Engineering");
  await expect(page.getByLabel(/Which role/)).toHaveCount(0);
  await expect(page.getByLabel(/Team size/)).toBeVisible();
  await page.getByLabel(/Work email/).fill("not-an-email");
  await page.getByLabel(/Full name/).fill("E2E Person");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText(/valid email/i)).toBeVisible();
  await page.getByLabel(/Work email/).fill(`e2e-${Date.now()}@example.org`);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText(/Thanks/);
});

test("login rejects bad credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@formforge.dev");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /invalid|incorrect|wrong/i })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("dashboard requires auth", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
