import { test, expect } from "@playwright/test";

/** Full new-customer journey in a fresh workspace (does not touch the demo workspace). */
test.describe.serial("new workspace journey", () => {
  const email = `e2e-${Date.now()}@example.org`;
  let key = "";
  let formUrl = "";
  test.use({ storageState: { cookies: [], origins: [] } });

  test("signup validates and creates a workspace", async ({ page, context }) => {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Tester");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /fix|password/i })).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue("E2E Tester"); // values survive a failed submit
    await page.getByLabel("Password").fill("e2e-password-123");
    await page.getByLabel("Workspace name (optional)").fill("E2E Workspace");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/dashboard/);
    await context.storageState({ path: "e2e/.auth/e2e-user.json" });
  });

  test("create a form, send a test submission, inspect it in the record drawer", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: "e2e/.auth/e2e-user.json" });
    const page = await ctx.newPage();
    await page.goto("/dashboard/forms");
    await page.getByTestId("new-form").first().click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: "Create form" }).click();
    await expect(dlg.getByText(/required|at least/i).first()).toBeVisible();
    await dlg.getByLabel("Form name").fill("E2E Contact");
    await dlg.getByRole("button", { name: "Create form" }).click();
    await page.waitForURL(/\/dashboard\/forms\/[^/?]+/);
    formUrl = page.url().split("?")[0].replace(/\/setup$/, "");
    await page.goto(`${formUrl}/setup`);
    await page.getByTestId("send-test").click();
    await expect(page.getByRole("status").filter({ hasText: /Accepted|Rejected/ })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Accepted/ })).toBeVisible();
    await page.goto(formUrl);
    const table = page.getByTestId("submissions-table");
    await expect(table.locator("tbody tr").first()).toBeVisible({ timeout: 15_000 });
    await table.locator("tbody tr").first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    for (const tab of ["Answers", "Enrichment", "Routing", "Activity", "Raw"]) {
      await drawer.getByRole("tab", { name: tab }).click();
      await expect(drawer.getByRole("tabpanel")).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await ctx.close();
  });

  test("create an API key (shown once) and use it against the REST API", async ({ browser, request }) => {
    const ctx = await browser.newContext({ storageState: "e2e/.auth/e2e-user.json" });
    const page = await ctx.newPage();
    await page.goto("/dashboard/api-keys");
    await page.getByTestId("new-key-btn").click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Key name").fill("E2E key");
    await dlg.getByRole("button", { name: "Create key" }).click();
    key = (await page.getByTestId("new-key").textContent())!.trim();
    expect(key).toMatch(/^ff_live_/);
    const res = await request.get("/api/v1/forms", { headers: { Authorization: `Bearer ${key}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.map((f: { name: string }) => f.name)).toContain("E2E Contact");
    await page.reload();
    await expect(page.getByText(key)).toHaveCount(0);
    await ctx.close();
  });

  test("integrations: keyless providers are disabled; test connection reports missing key", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: "e2e/.auth/e2e-user.json" });
    const page = await ctx.newPage();
    await page.goto("/dashboard/integrations");
    const apollo = page.locator("#apollo");
    await expect(apollo.getByText(/no key/i)).toBeVisible();
    await apollo.getByRole("button", { name: /Test connection/i }).click();
    await expect(apollo.getByText(/No API key configured/i)).toBeVisible();
    await ctx.close();
  });

  test("command palette navigates", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: "e2e/.auth/e2e-user.json" });
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await page.getByTestId("search-trigger").click();
    await page.keyboard.type("API keys");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dashboard\/api-keys/);
    await ctx.close();
  });
});
