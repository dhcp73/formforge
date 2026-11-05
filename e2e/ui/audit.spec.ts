import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { allRoutes, resolvePath, watch, layoutIssues, setTheme, AUTH_FILE, BASE, type Issue } from "../support";

const checked = new Map<string, number>();
const SHOT_DIR = path.join(process.cwd(), "screenshots", "qa");

for (const route of allRoutes()) {
  test(`${route.name}`, async ({ browser }, info) => {
    const theme = (info.project.metadata as { theme: "light" | "dark" }).theme;
    const ctx = await browser.newContext({ ...info.project.use, storageState: route.auth ? AUTH_FILE : undefined, baseURL: BASE });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    const issues = watch(page);
    const url = resolvePath(route.path);
    const res = await page.goto(url, { waitUntil: "load" });
    expect(res?.status(), `HTTP status for ${url}`).toBeLessThan(400);
    if (route.auth) expect(page.url(), "should stay signed in").not.toContain("/login");
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(300);
    const html = await page.content();
    expect(html).not.toMatch(/Application error|This page could not be found|Internal Server Error/);
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(theme === "dark");

    // /docs/api is the third-party Scalar reference: we audit our page chrome, not Scalar's internal layout
    const found: Issue[] = [...issues(), ...(url.startsWith("/docs/api") ? [] : await layoutIssues(page))];

    if (!url.startsWith("/docs/api")) {
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("[data-axe-skip]").analyze();
      for (const v of axe.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
        found.push({ kind: `axe:${v.id}`, severity: "error", message: `${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}` });
      }
    }

    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
    for (const h of new Set(hrefs)) {
      const u = new URL(h);
      if (u.origin !== new URL(BASE).origin || u.pathname.startsWith("/api/app/") || u.pathname.startsWith("/api/v1/") || u.pathname === "/logout") continue;
      const key = u.pathname + u.search;
      if (!checked.has(key)) checked.set(key, (await ctx.request.get(key, { maxRedirects: 5 })).status());
      const st = checked.get(key)!;
      if (st >= 400) found.push({ kind: "dead-link", severity: "error", message: `${key} → ${st}` });
    }

    const dir = path.join(SHOT_DIR, info.project.name);
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `${route.name}.png`), fullPage: true });
    await info.attach("issues.json", { body: JSON.stringify(found, null, 2), contentType: "application/json" });
    await ctx.close();
    const errors = found.filter((i) => i.severity === "error");
    expect(errors, errors.map((e) => `[${e.kind}] ${e.message}`).join("\n")).toEqual([]);
  });
}
