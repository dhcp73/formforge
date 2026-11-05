/**
 * Curated product screenshots → screenshots/*.png (`npm run screenshots`, app must be running).
 * Uses the demo login and the demo API key (data/demo-api-key.txt) to find a rich lead.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";

const BASE = process.env.FORMFORGE_URL || "http://localhost:3100";
const OUT = path.join(process.cwd(), "screenshots");
const KEY = fs.readFileSync(path.join(process.cwd(), "data", "demo-api-key.txt"), "utf8").trim();

async function api<T>(p: string): Promise<T> {
  const r = await fetch(`${BASE}/api/v1${p}`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${p} → ${r.status}`);
  return (await r.json()) as T;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 400));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const forms = await api<{ data: { id: string; name: string }[] }>("/forms");
  const sales = forms.data.find((f) => f.name === "Contact sales") ?? forms.data[0];
  const subs = await api<{ data: { id: string; fit_score: number | null }[] }>(`/forms/${sales.id}/submissions?limit=25`);
  const lead = subs.data.find((s) => (s.fit_score ?? 0) >= 90) ?? subs.data[0];

  const browser = await chromium.launch();
  const shoot = async (name: string, url: string, opts: { width?: number; height?: number; theme?: "light" | "dark"; auth?: boolean; full?: boolean } = {}) => {
    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: opts.width ?? 1440, height: opts.height ?? 900 }, deviceScaleFactor: 1, storageState: opts.auth === false ? undefined : path.join(OUT, ".auth.json") });
    await ctx.addInitScript((t) => localStorage.setItem("theme", t), opts.theme ?? "light");
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load" });
    await settle(page);
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: !!opts.full });
    console.log(file);
    await ctx.close();
  };

  // log in once
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@formforge.dev");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard/);
  await ctx.storageState({ path: path.join(OUT, ".auth.json") });
  await ctx.close();

  await shoot("01-landing", "/", { auth: false });
  await shoot("02-dashboard", "/dashboard");
  await shoot("03-submissions-table", `/dashboard/forms/${sales.id}`);
  await shoot("04-record-drawer", `/dashboard/forms/${sales.id}?s=${lead.id}`);
  await shoot("05-routing", "/dashboard/routing");
  await shoot("06-integrations", "/dashboard/integrations");
  await shoot("07-api-keys", "/dashboard/api-keys");
  await shoot("08-api-docs", "/docs/api", { auth: false });
  await shoot("09-status", "/status", { auth: false });
  await shoot("10-mobile-dashboard-dark", "/dashboard", { width: 390, height: 844, theme: "dark" });
  await shoot("11-qa-agent", "/dashboard/qa");
  await shoot("12-dashboard-dark", "/dashboard", { theme: "dark" });
  fs.rmSync(path.join(OUT, ".auth.json"), { force: true });
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
