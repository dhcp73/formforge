import { test, expect, type Page } from "@playwright/test";
import { AUTH_FILE, BASE, resolvePath } from "../support";

const focusVisible = async (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return { ok: false, what: "body" };
  const s = getComputedStyle(el);
  const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (!!s.boxShadow && s.boxShadow !== "none");
  return { ok: ring, what: `${el.tagName} ${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30)}` };
});

test.describe("keyboard & focus", () => {
  test.beforeEach(({}, info) => { test.skip(!info.project.name.startsWith("laptop"), "keyboard checks run on laptop viewports"); });

  for (const [p, auth] of [["/", false], ["/pricing", false], ["/docs", false], ["/login", false], ["/dashboard", true], ["/dashboard/forms/{FORM}", true], ["/dashboard/integrations", true]] as const) {
    test(`Tab focus is visible on ${p}`, async ({ browser }, info) => {
      const ctx = await browser.newContext({ ...info.project.use, storageState: auth ? AUTH_FILE : undefined, baseURL: BASE });
      const page = await ctx.newPage();
      await page.goto(resolvePath(p));
      await page.waitForLoadState("networkidle").catch(() => undefined);
      const bad: string[] = [];
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        const r = await focusVisible(page);
        if (!r.ok && r.what !== "body") bad.push(r.what); // body = focus wrapped past the last control
      }
      expect(bad, `elements without a visible focus indicator: ${bad.join(", ")}`).toEqual([]);
      await ctx.close();
    });
  }

  test("Cmd/Ctrl+K opens the command palette, Esc closes it, navigation works", async ({ browser }, info) => {
    const ctx = await browser.newContext({ ...info.project.use, storageState: AUTH_FILE, baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.type("Integrations");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dashboard\/integrations/);
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await ctx.close();
  });

  test("record drawer opens from the table with Enter and closes with Esc", async ({ browser }, info) => {
    const ctx = await browser.newContext({ ...info.project.use, storageState: AUTH_FILE, baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto(resolvePath("/dashboard/forms/{FORM}"));
    const row = page.getByTestId("submissions-table").locator("tbody tr").first();
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/[?&]s=/);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("tab", { name: "Enrichment" }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]s=/);
    await ctx.close();
  });

  test("modals close with Esc (create form)", async ({ browser }, info) => {
    const ctx = await browser.newContext({ ...info.project.use, storageState: AUTH_FILE, baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/dashboard/forms?new=1");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await ctx.close();
  });
});
