/**
 * FormForge autonomous UI testing agent.
 *
 *   npm run agent:ui                 full crawl: 4 viewports × light/dark
 *   npm run agent:ui -- --quick      laptop-light + mobile-dark only (used by the scheduled run)
 *   npm run agent:ui -- --ai         add an AI visual review of screenshots (needs OPENAI_API_KEY or OPENROUTER_API_KEY)
 *
 * It signs in as the demo user, discovers routes by crawling same-origin links (BFS from /, /docs, /status, /dashboard),
 * and on every page × viewport × theme checks console errors, failed requests, HTTP ≥ 400, horizontal overflow,
 * overlapping controls, '#'/empty hrefs, dead internal links and axe (serious/critical). Writes
 * reports/ui-agent/index.html + report.json + screenshots, and records the run in qa_runs (shown on
 * /dashboard/qa and in the status monitor's "UI QA agent" component). Exit code 1 when errors are found.
 *
 * Schedule it with FORMFORGE_QA_CRON (e.g. "0 6 * * *") on the worker.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { watch, layoutIssues, type Issue } from "../e2e/support";
import { getDb, now } from "@/lib/db";

/** Resolve to a fallback if a page call hangs (a busy renderer must not stall the whole crawl). */
function guard<T>(p: Promise<T>, fallback: T, ms = 20_000): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}
import { newId } from "@/lib/ids";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const BASE = opt("base") || process.env.FORMFORGE_URL || `http://127.0.0.1:${process.env.PORT || 3100}`;
const QUICK = flag("quick");
const AI = flag("ai") || process.env.FORMFORGE_QA_AI === "1";
const MAX_PAGES = Number(opt("max-pages") || (QUICK ? 40 : 80));
const OUT = path.join(process.cwd(), "reports", "ui-agent");
const EMAIL = process.env.FORMFORGE_QA_EMAIL || "demo@formforge.dev";
const PASSWORD = process.env.FORMFORGE_QA_PASSWORD || "demo1234";

const ALL_VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 }, { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 }, { name: "desktop", width: 1440, height: 900 },
];
const MATRIX = QUICK
  ? [{ vp: ALL_VIEWPORTS[2], theme: "light" as const }, { vp: ALL_VIEWPORTS[0], theme: "dark" as const }]
  : ALL_VIEWPORTS.flatMap((vp) => (["light", "dark"] as const).map((theme) => ({ vp, theme })));

interface PageResult { path: string; viewport: string; theme: string; status: number; ms: number; issues: Issue[]; shot: string; ai?: string[] }

const runId = opt("run-id") || newId("qa");
const db = getDb();
if (!db.prepare("SELECT 1 FROM qa_runs WHERE id = ?").get(runId)) db.prepare("INSERT INTO qa_runs (id, status, started_at) VALUES (?, 'running', ?)").run(runId, now());
else db.prepare("UPDATE qa_runs SET status = 'running' WHERE id = ?").run(runId);

const skip = (u: URL) => u.pathname.startsWith("/api/") || u.pathname === "/logout" || /\.(png|svg|ico|csv|json|js|css|txt|xml)$/.test(u.pathname);
const keyOf = (u: URL) => {
  // collapse ids so /dashboard/forms/<id> is one route; keep the record drawer (?s=) as its own route
  const p = u.pathname.replace(/\/(sub|frm)_[A-Za-z0-9]+/g, "/:id");
  return p + (u.searchParams.has("s") ? "?s" : "");
};

async function login(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await page.close();
  return ctx;
}

async function discover(ctx: BrowserContext): Promise<string[]> {
  const seeds = ["/", "/docs", "/status", "/dashboard", "/dashboard/forms"];
  const queue = [...seeds];
  const seen = new Map<string, string>();
  const page = await ctx.newPage();
  while (queue.length && seen.size < MAX_PAGES) {
    const p = queue.shift()!;
    const u = new URL(p, BASE);
    const k = keyOf(u);
    if (seen.has(k)) continue;
    seen.set(k, u.pathname + u.search);
    try {
      await page.goto(u.pathname + u.search, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
      for (const l of links) {
        const lu = new URL(l);
        if (lu.origin !== new URL(BASE).origin || skip(lu)) continue;
        if (!seen.has(keyOf(lu))) queue.push(lu.pathname + (lu.searchParams.has("s") ? `?s=${lu.searchParams.get("s")}` : ""));
      }
    } catch { /* recorded during audit */ }
  }
  await page.close();
  return [...seen.values()];
}

async function aiReview(png: Buffer, route: string): Promise<string[]> {
  const { generateText, Output } = await import("ai");
  const { z } = await import("zod");
  const model = process.env.OPENAI_API_KEY
    ? (await import("@ai-sdk/openai")).createOpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL }).chat(process.env.OPENAI_MODEL || "gpt-4o-mini")
    : (await import("@openrouter/ai-sdk-provider")).createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! }).chat(process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini");
  const res = await generateText({
    model, maxRetries: 0, abortSignal: AbortSignal.timeout(45_000),
    output: Output.object({ schema: z.object({ issues: z.array(z.string()).describe("Concrete visual defects: clipped/overlapping text, broken layout, unreadable contrast, misaligned elements. Empty if none.") }) }),
    messages: [{ role: "user", content: [{ type: "text", text: `You are a meticulous UI QA reviewer. Screenshot of route ${route} of a B2B SaaS dashboard. List only real visual defects.` }, { type: "image", image: png }] }],
  });
  return (res.output as { issues: string[] }).issues;
}

function html(report: ReturnType<typeof summarise> & { results: PageResult[] }) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const rows = report.results.map((r) => {
    const errs = r.issues.filter((i) => i.severity === "error");
    return `<tr class="${errs.length ? "bad" : "ok"}"><td><code>${esc(r.path)}</code></td><td>${r.viewport}</td><td>${r.theme}</td><td>${r.status}</td><td>${r.ms} ms</td>
      <td>${errs.length ? `<span class="pill red">${errs.length} error${errs.length > 1 ? "s" : ""}</span>` : '<span class="pill green">pass</span>'}${r.issues.length - errs.length ? ` <span class="pill amber">${r.issues.length - errs.length} warn</span>` : ""}
      ${r.issues.length ? `<ul>${r.issues.map((i) => `<li><b>${esc(i.kind)}</b> ${esc(i.message)}</li>`).join("")}</ul>` : ""}${r.ai?.length ? `<ul class="ai">${r.ai.map((a) => `<li>AI: ${esc(a)}</li>`).join("")}</ul>` : ""}</td>
      <td><a href="${r.shot}"><img loading="lazy" src="${r.shot}" alt="Screenshot of ${esc(r.path)} at ${r.viewport} ${r.theme}"></a></td></tr>`;
  }).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FormForge UI agent report</title>
<style>body{font:14px/1.5 ui-sans-serif,system-ui,sans-serif;margin:0;color:#18181b;background:#fafafa}header{padding:24px 32px;background:#fff;border-bottom:1px solid #e4e4e7}
h1{margin:0 0 4px;font-size:20px}.kpis{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}.kpi{background:#f4f4f5;border-radius:8px;padding:10px 14px;min-width:110px}.kpi b{display:block;font-size:20px}
main{padding:24px 32px}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e4e4e7;border-radius:8px}td,th{padding:8px 10px;border-top:1px solid #f0f0f2;text-align:left;vertical-align:top}
th{background:#f8f8f9;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#52525b}tr.bad{background:#fff5f5}img{width:160px;border:1px solid #e4e4e7;border-radius:4px}
.pill{display:inline-block;border-radius:999px;padding:0 8px;font-size:12px;font-weight:600}.green{background:#dcfce7;color:#166534}.red{background:#fee2e2;color:#991b1b}.amber{background:#fef3c7;color:#92400e}
ul{margin:6px 0 0;padding-left:18px;font-size:12.5px;color:#3f3f46}.ai li{color:#4338ca}code{font-size:12.5px}</style></head><body>
<header><h1>UI agent report · ${report.passed ? '<span class="pill green">PASS</span>' : '<span class="pill red">FAIL</span>'}</h1>
<div>Run <code>${runId}</code> · ${esc(BASE)} · ${new Date(report.finishedAt).toUTCString()} · mode ${report.mode} · AI review: ${esc(report.aiReview)}</div>
<div class="kpis"><div class="kpi"><b>${report.routes}</b>routes</div><div class="kpi"><b>${report.pages}</b>page checks</div><div class="kpi"><b>${report.viewports.length}×${report.themes.length}</b>viewports × themes</div>
<div class="kpi"><b>${report.errors}</b>errors</div><div class="kpi"><b>${report.warnings}</b>warnings</div><div class="kpi"><b>${Math.round(report.durationMs / 1000)}s</b>duration</div></div></header>
<main><table><thead><tr><th>Route</th><th>Viewport</th><th>Theme</th><th>HTTP</th><th>Load</th><th>Result</th><th>Screenshot</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`;
}

const started = Date.now();
function summarise(results: PageResult[], routes: string[], aiState: string) {
  const all = results.flatMap((r) => r.issues);
  const checks: Record<string, number> = {};
  for (const i of all) checks[i.kind] = (checks[i.kind] ?? 0) + 1;
  const errors = all.filter((i) => i.severity === "error").length;
  return {
    runId, base: BASE, mode: QUICK ? "quick" : "full", pages: results.length, routes: routes.length,
    viewports: [...new Set(MATRIX.map((m) => `${m.vp.name} ${m.vp.width}×${m.vp.height}`))], themes: [...new Set(MATRIX.map((m) => m.theme))],
    issues: all.length, errors, warnings: all.length - errors, passed: errors === 0, durationMs: Date.now() - started, aiReview: aiState, checks, finishedAt: new Date().toISOString(),
  };
}

async function main() {
  fs.rmSync(path.join(OUT, "shots"), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
  const browser = await chromium.launch();
  const authed = await login(browser);
  const state = await authed.storageState();
  const routes = await discover(authed);
  console.log(`[ui-agent] discovered ${routes.length} routes; matrix ${MATRIX.length} (viewport × theme)`);
  const aiState = !AI ? "off" : process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY ? "on" : "skipped (no OPENAI_API_KEY / OPENROUTER_API_KEY)";
  const linkStatus = new Map<string, number>();
  const results: PageResult[] = [];
  for (const { vp, theme } of MATRIX) {
    const ctx = await browser.newContext({ baseURL: BASE, storageState: state, viewport: { width: vp.width, height: vp.height }, colorScheme: theme, isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch { /* ignore */ } }, theme);
    const page = await ctx.newPage();
    for (const route of routes) {
      const issues = watch(page);
      const before = issues().length;
      const t0 = Date.now();
      let status = 0;
      try {
        const res = await page.goto(route, { waitUntil: "load", timeout: 30_000 });
        status = res?.status() ?? 0;
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
      } catch (e) { issues().push({ kind: "navigation", severity: "error", message: String(e).slice(0, 200) }); }
      const ms = Date.now() - t0;
      const found: Issue[] = issues().slice(before);
      if (status >= 400) found.push({ kind: "http", severity: "error", message: `${route} returned ${status}` });
      if (ms > 8000) found.push({ kind: "slow", severity: "warning", message: `Load took ${ms} ms` });
      const content = await guard(page.content(), "");
      if (/Application error|Internal Server Error/.test(content)) found.push({ kind: "crash", severity: "error", message: "Error boundary / server error rendered" });
      if (!route.startsWith("/docs/api")) {
        found.push(...(await guard(layoutIssues(page), [] as Issue[])));
        const axe = await guard(new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze(), null, 45_000);
        for (const v of axe?.violations ?? []) {
          if (v.impact !== "serious" && v.impact !== "critical") continue;
          found.push({ kind: `axe:${v.id}`, severity: "error", message: `${v.help} (${v.nodes.length} node${v.nodes.length > 1 ? "s" : ""})` });
        }
      }
      const hrefs = await guard(page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href)), [] as string[], 15_000);
      for (const h of new Set(hrefs)) {
        const u = new URL(h);
        if (u.origin !== new URL(BASE).origin || skip(u)) continue;
        const k = u.pathname + u.search;
        if (!linkStatus.has(k)) linkStatus.set(k, (await ctx.request.get(k).catch(() => null))?.status() ?? 0);
        if ((linkStatus.get(k) ?? 0) >= 400) found.push({ kind: "dead-link", severity: "error", message: `${k} → ${linkStatus.get(k)}` });
      }
      const shot = `shots/${vp.name}-${theme}-${route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}.png`;
      const png = await page.screenshot({ path: path.join(OUT, shot), fullPage: false }).catch(() => null);
      let ai: string[] | undefined;
      if (aiState === "on" && png) {
        try { ai = await aiReview(png, route); for (const a of ai) found.push({ kind: "ai-visual", severity: "warning", message: a }); }
        catch (e) { found.push({ kind: "ai-visual", severity: "warning", message: `AI review failed: ${String(e).slice(0, 120)}` }); }
      }
      results.push({ path: route, viewport: `${vp.name} ${vp.width}×${vp.height}`, theme, status, ms, issues: found, shot, ai });
      page.removeAllListeners();
    }
    await ctx.close();
  }
  await browser.close();
  const summary = summarise(results, routes, aiState);
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ ...summary, results }, null, 2));
  fs.writeFileSync(path.join(OUT, "index.html"), html({ ...summary, results }));
  db.prepare("UPDATE qa_runs SET status = ?, summary = ?, report_path = ?, finished_at = ? WHERE id = ?").run(summary.passed ? "passed" : "failed", JSON.stringify(summary), "reports/ui-agent/index.html", now(), runId);
  console.log(`[ui-agent] ${summary.passed ? "PASS" : "FAIL"} · ${summary.routes} routes · ${summary.pages} page checks · ${summary.errors} errors · ${summary.warnings} warnings · ${Math.round(summary.durationMs / 1000)}s`);
  for (const [k, v] of Object.entries(summary.checks)) console.log(`   ${k}: ${v}`);
  console.log(`[ui-agent] report: ${path.join(OUT, "index.html")}`);
  process.exitCode = summary.passed ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  db.prepare("UPDATE qa_runs SET status = 'failed', summary = ?, finished_at = ? WHERE id = ?").run(JSON.stringify({ error: String(e) }), now(), runId);
  process.exit(2);
});
