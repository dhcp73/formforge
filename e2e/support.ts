import fs from "node:fs";
import path from "node:path";
import type { Page, Response as PwResponse } from "@playwright/test";

export const BASE = process.env.FORMFORGE_URL || "http://127.0.0.1:3100";
export const AUTH_FILE = path.join(process.cwd(), "e2e", ".auth", "demo.json");
export const IDS_FILE = path.join(process.cwd(), "e2e", ".auth", "ids.json");
export const DEMO = { email: "demo@formforge.dev", password: "demo1234" };

export interface Ids { formId: string; schemaFormId: string; submissionId: string }
export const ids = (): Ids => JSON.parse(fs.readFileSync(IDS_FILE, "utf8"));

export interface RouteDef { path: string; name: string; auth: boolean }
export const PLACEHOLDER_IDS: Ids = { formId: "{FORM}", schemaFormId: "{SCHEMAFORM}", submissionId: "{SUB}" };
export const resolvePath = (p: string, i: Ids = ids()) => p.replaceAll("{FORM}", i.formId).replaceAll("{SCHEMAFORM}", i.schemaFormId).replaceAll("{SUB}", i.submissionId);

export function allRoutes(i: Ids = PLACEHOLDER_IDS): RouteDef[] {
  const pub = ["/", "/features", "/pricing", "/about", "/changelog", "/status", "/login", "/signup", "/thanks", "/docs", "/docs/quickstart", "/docs/dynamic-fields", "/docs/spam", "/docs/scheduling", "/docs/enrichment", "/docs/routing",
    "/docs/integrations", "/docs/integrations/apollo", "/docs/integrations/clay", "/docs/integrations/valyu", "/docs/integrations/openai", "/docs/integrations/openrouter", "/docs/integrations/ai",
    "/docs/api-keys", "/docs/rest-api", "/docs/webhooks", "/docs/mcp", "/docs/status", "/docs/api", `/f/${i.schemaFormId}`, `/f/${i.formId}?embed=1`];
  const app = ["/dashboard", "/dashboard/forms", `/dashboard/forms/${i.formId}`, `/dashboard/forms/${i.formId}?s=${i.submissionId}`, `/dashboard/forms/${i.formId}/setup`, `/dashboard/forms/${i.formId}/settings`, `/dashboard/forms/${i.formId}/automations`,
    `/dashboard/submissions/${i.submissionId}`, "/dashboard/leads", "/dashboard/routing", "/dashboard/enrichment", "/dashboard/integrations", "/dashboard/api-keys", "/dashboard/webhooks", "/dashboard/schedules",
    "/dashboard/outbox", "/dashboard/health", "/dashboard/qa", "/dashboard/settings"];
  const name = (p: string) => (p.replace(/[?=&]/g, "_").replace(/^\/|\/$/g, "").replace(/\//g, "__") || "home").replace(i.schemaFormId, "SCHEMAFORM").replace(i.formId, "FORM").replace(i.submissionId, "SUB").replace(/[{}]/g, "");
  return [...pub.map((p) => ({ path: p, name: name(p), auth: false })), ...app.map((p) => ({ path: p, name: name(p), auth: true }))];
}

export interface Issue { kind: string; severity: "error" | "warning"; message: string }

/** Attach console/network listeners. Returns a getter for issues seen so far. */
export function watch(page: Page) {
  const issues: Issue[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/Download the React DevTools|favicon/i.test(t)) return;
    issues.push({ kind: "console", severity: "error", message: t.slice(0, 300) });
  });
  page.on("pageerror", (e) => issues.push({ kind: "pageerror", severity: "error", message: e.message.slice(0, 300) }));
  page.on("requestfailed", (r) => {
    const f = r.failure()?.errorText ?? "";
    if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(f)) return; // navigation / RSC prefetch aborts
    issues.push({ kind: "requestfailed", severity: "error", message: `${r.method()} ${r.url()} ${f}` });
  });
  page.on("response", (r: PwResponse) => {
    const u = new URL(r.url());
    if (!u.href.startsWith(BASE)) return;
    if (r.status() >= 400 && !u.pathname.startsWith("/api/f/")) issues.push({ kind: "http", severity: "error", message: `${r.status()} ${u.pathname}${u.search}` });
  });
  return () => issues;
}

/** In-page layout checks: horizontal overflow, '#' hrefs, overlapping interactive elements, images without alt. */
export async function layoutIssues(page: Page): Promise<Issue[]> {
  return page.evaluate(() => {
    const out: { kind: string; severity: "error" | "warning"; message: string }[] = [];
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) {
      const wide = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.right <= vw + 1 || r.width === 0) return false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return false;
        }
        return true;
      }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ").slice(0, 3).join(".")}`);
      out.push({ kind: "overflow", severity: "error", message: `Horizontal overflow: scrollWidth ${document.documentElement.scrollWidth} > ${vw} (${wide.join(", ")})` });
    }
    for (const a of Array.from(document.querySelectorAll("a"))) {
      const h = a.getAttribute("href");
      if (h === "#" || h === "" || h === null) out.push({ kind: "dead-href", severity: "error", message: `<a> with href="${h}" text="${(a.textContent ?? "").trim().slice(0, 40)}"` });
    }
    for (const img of Array.from(document.querySelectorAll("img"))) if (!img.hasAttribute("alt")) out.push({ kind: "a11y", severity: "warning", message: `img without alt: ${img.src.slice(0, 80)}` });
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.opacity === "0" || s.pointerEvents === "none") return null;
      if (el.closest("[aria-hidden=true],[hidden],.sr-only,[data-radix-popper-content-wrapper],[role=dialog],[data-overlap-ok]")) return null;
      return r;
    };
    const ctl = Array.from(document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea")).map((el) => ({ el, r: visible(el) })).filter((x) => x.r) as { el: Element; r: DOMRect }[];
    let n = 0;
    for (let i = 0; i < ctl.length && n < 5; i++) for (let j = i + 1; j < ctl.length && n < 5; j++) {
      const a = ctl[i], b = ctl[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ix > 4 && iy > 4 && ix * iy > 0.25 * Math.min(a.r.width * a.r.height, b.r.width * b.r.height)) {
        // only count when one actually covers the other at the overlap centre
        const cx = Math.max(a.r.left, b.r.left) + ix / 2, cy = Math.max(a.r.top, b.r.top) + iy / 2;
        if (cy < 0 || cy > innerHeight) continue;
        const top = document.elementFromPoint(cx, cy);
        if (!top || !(a.el.contains(top) || b.el.contains(top))) continue;
        n++;
        const d = (e: Element) => `${e.tagName.toLowerCase()}[${(e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 30)}]`;
        out.push({ kind: "overlap", severity: "error", message: `${d(a.el)} overlaps ${d(b.el)}` });
      }
    }
    return out;
  });
}

export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch { /* ignore */ } }, theme);
}
