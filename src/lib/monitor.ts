import { resolveProvider } from "./integrations/store";
import fs from "node:fs";
import path from "node:path";
import { dataDir, getDb, now } from "./db";
import { newId } from "./ids";
import { kvGet, kvSet } from "./kv";
import { encrypt, decrypt } from "./secrets";
import { createApiKey } from "./apikeys";
import { createForm, getForm } from "./forms";
import { SCOPES } from "./types";
import { createWebhook, listWebhooks, createDelivery, attemptDelivery } from "./webhooks";
import { sendEmail } from "./email";
import { evaluateRules, type RoutingRule } from "./routing";
import { INTEGRATIONS } from "./integrations/registry";
import { LOCAL_ENRICHERS } from "./enrich/local";
import { runEnricher } from "./enrich/pipeline";
import { emptyEnrichment } from "./enrich/merge";

export type HealthStatus = "ok" | "degraded" | "down" | "disabled";
export interface ProbeResult { component: string; status: HealthStatus; latencyMs: number | null; message: string }

export const COMPONENTS: { id: string; label: string; group: string }[] = [
  { id: "database", label: "Database (SQLite)", group: "Core" },
  { id: "storage", label: "Disk & file storage", group: "Core" },
  { id: "ingest", label: "Submission endpoint", group: "Core" },
  { id: "rest_api", label: "REST API", group: "Developer" },
  { id: "openapi", label: "OpenAPI spec", group: "Developer" },
  { id: "mcp", label: "MCP server", group: "Developer" },
  { id: "queue", label: "Job queue / worker", group: "Automation" },
  { id: "scheduler", label: "Scheduler", group: "Automation" },
  { id: "webhooks", label: "Webhook delivery", group: "Automation" },
  { id: "email", label: "Email transport", group: "Automation" },
  { id: "routing", label: "Routing engine", group: "Automation" },
  { id: "enrichment_local", label: "Offline enrichment (email, IP geo, UA)", group: "Enrichment" },
  { id: "ui_qa", label: "UI QA agent (latest run)", group: "Quality" },
  ...INTEGRATIONS.filter((i) => i.keyField).map((i) => ({ id: `provider_${i.id}`, label: i.label, group: "Enrichment providers" })),
];

export const SYSTEM_WS = "ws_system";

export function baseUrl() {
  return (process.env.FORMFORGE_INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3100}`).replace(/\/$/, "");
}

/** Hidden system workspace + monitor form + API key used by synthetic probes. */
export function ensureSystem(): { formId: string; apiKey: string } {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM workspaces WHERE id = ?").get(SYSTEM_WS)) {
    db.prepare("INSERT INTO workspaces (id, name, system, created_at) VALUES (?, 'System monitor', 1, ?)").run(SYSTEM_WS, now());
  }
  let formId = kvGet("monitor_form_id");
  if (!formId || !getForm(SYSTEM_WS, formId)) {
    formId = createForm(SYSTEM_WS, {
      name: "Health probe", description: "Synthetic submissions from the status monitor",
      settings: { rateLimitPerMinute: 10000, duplicateWindowMinutes: 0, spamThreshold: 100, enrichment: { email: false, geo: false, userAgent: false, company: false, apollo: false, clay: false, valyu: false, ai: false, deepResearch: false, deepResearchMode: "fast" } },
    }).id;
    kvSet("monitor_form_id", formId);
  }
  let enc = kvGet("monitor_api_key");
  let apiKey: string | null = null;
  if (enc) { try { apiKey = decrypt(enc); } catch { apiKey = null; } }
  if (!apiKey) {
    apiKey = createApiKey(SYSTEM_WS, "Status monitor", [...SCOPES]).key;
    enc = encrypt(apiKey);
    kvSet("monitor_api_key", enc);
  }
  return { formId, apiKey };
}

async function timed(component: string, fn: () => Promise<{ status?: HealthStatus; message: string }>): Promise<ProbeResult> {
  const t = Date.now();
  try {
    const r = await fn();
    return { component, status: r.status ?? "ok", latencyMs: Date.now() - t, message: r.message };
  } catch (e) {
    return { component, status: "down", latencyMs: Date.now() - t, message: e instanceof Error ? e.message : String(e) };
  }
}

function ageMs(key: string) { const v = kvGet(key); return v ? Date.now() - new Date(v).getTime() : Infinity; }

export async function runProbes(opts: { http?: boolean } = {}): Promise<ProbeResult[]> {
  const http = opts.http ?? true;
  const db = getDb();
  const sys = ensureSystem();
  const base = baseUrl();
  const auth = { Authorization: `Bearer ${sys.apiKey}` };
  const probes: Promise<ProbeResult>[] = [];

  probes.push(timed("database", async () => {
    const v = now();
    kvSet("monitor_db_probe", v);
    if (kvGet("monitor_db_probe") !== v) throw new Error("Read-after-write mismatch");
    return { message: "Read/write OK" };
  }));
  probes.push(timed("storage", async () => {
    const dir = dataDir();
    const f = path.join(dir, ".health-probe");
    fs.writeFileSync(f, now());
    fs.unlinkSync(f);
    const st = fs.statfsSync(dir);
    const freeGb = (st.bavail * st.bsize) / 1e9;
    if (freeGb < 0.1) return { status: "down", message: `Only ${freeGb.toFixed(2)} GB free` };
    if (freeGb < 1) return { status: "degraded", message: `${freeGb.toFixed(2)} GB free` };
    return { message: `${freeGb.toFixed(1)} GB free` };
  }));
  if (http) {
    probes.push(timed("ingest", async () => {
      const res = await fetch(`${base}/api/f/${sys.formId}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "FormForge-Monitor/1.0" }, body: JSON.stringify({ probe: "synthetic", at: now() }), signal: AbortSignal.timeout(10_000) });
      const j = (await res.json().catch(() => ({}))) as { id?: string };
      if (!res.ok || !j.id) throw new Error(`HTTP ${res.status}`);
      db.prepare("DELETE FROM submissions WHERE id = ?").run(j.id);
      return { message: "Synthetic submission accepted and cleaned up" };
    }));
    probes.push(timed("rest_api", async () => {
      const res = await fetch(`${base}/api/v1/forms`, { headers: auth, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { message: "Authenticated GET /api/v1/forms OK" };
    }));
    probes.push(timed("openapi", async () => {
      const res = await fetch(`${base}/api/v1/openapi.json`, { signal: AbortSignal.timeout(10_000) });
      const j = (await res.json()) as { openapi?: string; paths?: object };
      if (!res.ok || !j.openapi) throw new Error(`HTTP ${res.status}`);
      return { message: `OpenAPI ${j.openapi} · ${Object.keys(j.paths ?? {}).length} paths` };
    }));
    probes.push(timed("mcp", async () => {
      const res = await fetch(`${base}/api/mcp`, {
        method: "POST", signal: AbortSignal.timeout(10_000),
        headers: { ...auth, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_forms", arguments: {} } }),
      });
      const text = await res.text();
      if (!res.ok || !text.includes("result")) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
      return { message: "tools/call list_forms OK" };
    }));
    probes.push(timed("webhooks", async () => {
      let hook = listWebhooks(SYSTEM_WS, sys.formId).find((h) => h.url.includes("/api/internal/echo"));
      if (!hook || !hook.url.startsWith(base)) {
        for (const h of listWebhooks(SYSTEM_WS, sys.formId)) db.prepare("DELETE FROM webhooks WHERE id = ?").run(h.id);
        hook = createWebhook(SYSTEM_WS, sys.formId, { url: `${base}/api/internal/echo`, active: false });
      }
      const id = createDelivery(hook, "health.probe", { probe: true, at: now() }, null);
      const r = await attemptDelivery(id);
      db.prepare("DELETE FROM webhook_deliveries WHERE id = ?").run(id);
      if (r.result !== "success") throw new Error("Echo delivery failed");
      return { message: "Signed delivery to echo endpoint verified" };
    }));
  }
  probes.push(timed("queue", async () => {
    const age = ageMs("worker_heartbeat");
    const failed = (db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'failed' AND updated_at >= ?").get(new Date(Date.now() - 3600_000).toISOString()) as { c: number }).c;
    const backlog = (db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'queued' AND run_at <= ?").get(new Date(Date.now() - 60_000).toISOString()) as { c: number }).c;
    if (age > 120_000) return { status: "down", message: age === Infinity ? "Worker has never reported" : `No worker heartbeat for ${Math.round(age / 1000)}s` };
    if (backlog > 200 || failed > 20) return { status: "degraded", message: `${backlog} overdue jobs · ${failed} failed in last hour` };
    return { message: `Heartbeat ${Math.round(age / 1000)}s ago · ${backlog} overdue · ${failed} failed (1h)` };
  }));
  probes.push(timed("scheduler", async () => {
    const age = ageMs("scheduler_heartbeat");
    if (age > 120_000) return { status: "down", message: "Scheduler tick is stale" };
    const n = (db.prepare("SELECT COUNT(*) AS c FROM schedules WHERE active = 1").get() as { c: number }).c;
    return { message: `Ticking · ${n} active schedules` };
  }));
  probes.push(timed("email", async () => {
    const r = await sendEmail({ to: "probe@formforge.local", subject: "Health probe", text: "probe", workspaceId: SYSTEM_WS, kind: "probe" });
    db.prepare("DELETE FROM emails WHERE id = ?").run(r.id);
    if (r.status === "failed") throw new Error(r.error ?? "send failed");
    return { message: r.status === "sent" ? "SMTP delivery OK" : "Outbox transport OK (set SMTP_URL for SMTP)" };
  }));
  probes.push(timed("routing", async () => {
    const rule = { id: "probe", workspaceId: SYSTEM_WS, formId: null, name: "Probe", priority: 1, match: "all", conditions: [{ field: "company.employees", op: "gte", value: 100 }, { field: "geo.country", op: "in", value: "GB,US" }], actions: { assignTo: ["probe-rep"], tags: ["probe"], notifyEmails: [], webhookUrl: "", markSpam: false }, stopOnMatch: true, active: true, hitCount: 0, rrIndex: 0, createdAt: now() } as RoutingRule;
    const r = evaluateRules([rule], { company: { employees: 250 }, geo: { country: "GB" } });
    if (r.owner !== "probe-rep") throw new Error("Synthetic lead was not routed correctly");
    return { message: "Synthetic lead routed correctly" };
  }));
  probes.push(timed("enrichment_local", async () => {
    const e = emptyEnrichment();
    const ctx = { workspaceId: SYSTEM_WS, data: {}, email: "probe@example.com", domain: "stripe.com", companyName: null, ip: "8.8.8.8", userAgent: "Mozilla/5.0 (Macintosh) Chrome/120" };
    await Promise.all(LOCAL_ENRICHERS.filter((x) => x.id !== "email").map((x) => runEnricher(x, ctx, e, { log: false })));
    if (!(e.geo as { country?: string })?.country || !(e.company as { name?: string })?.name) throw new Error("Offline enrichers returned no data");
    return { message: "IP geo, UA and offline dataset OK" };
  }));
  probes.push(timed("ui_qa", async () => {
    const r = db.prepare("SELECT status, summary, finished_at FROM qa_runs WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1").get() as { status: string; summary: string; finished_at: string } | undefined;
    if (!r) return { status: "disabled", message: "No UI agent run yet (npm run agent:ui)" };
    let sum: { errors?: number; pages?: number; routes?: number } = {};
    try { sum = JSON.parse(r.summary); } catch { /* ignore */ }
    const ageH = (Date.now() - new Date(r.finished_at).getTime()) / 3600_000;
    if (r.status !== "passed") return { status: "degraded", message: `Last run ${r.status}: ${sum.errors ?? "?"} UI errors` };
    if (ageH > 48) return { status: "degraded", message: `Last passing run is ${Math.round(ageH)}h old` };
    return { message: `Passed · ${sum.routes ?? "?"} routes · ${sum.pages ?? "?"} page checks · ${Math.round(ageH * 10) / 10}h ago` };
  }));
  for (const def of INTEGRATIONS.filter((i) => i.keyField)) {
    probes.push(timed(`provider_${def.id}`, async () => {
      const keyField = def.fields.find((f) => f.key === def.keyField)!;
      const envConfigured = !!(keyField.env && process.env[keyField.env]);
      const rows = db.prepare("SELECT workspace_id FROM integrations WHERE provider = ? AND enabled = 1").all(def.id) as { workspace_id: string }[];
      const wsEnabled = rows.filter((r) => resolveProvider(r.workspace_id, def.id).enabled).length;
      if (!envConfigured && !wsEnabled) return { status: "disabled", message: "No API key configured (optional)" };
      const stats = db.prepare("SELECT COUNT(*) AS n, SUM(status IN ('error','timeout')) AS bad FROM enrichment_logs WHERE provider = ? AND created_at >= ?").get(def.id, new Date(Date.now() - 15 * 60_000).toISOString()) as { n: number; bad: number | null };
      if (stats.n >= 3 && (stats.bad ?? 0) / stats.n > 0.5) return { status: "degraded", message: `${stats.bad}/${stats.n} calls failed in 15 min` };
      return { message: `Configured (${envConfigured ? "env" : `${wsEnabled} workspace(s)`}) · ${stats.n} calls in 15 min` };
    }));
  }
  return Promise.all(probes);
}

async function alert(kind: "opened" | "resolved", component: string, message: string) {
  const text = `[FormForge status] ${component} incident ${kind}: ${message}`;
  if (process.env.ALERT_WEBHOOK_URL) {
    await fetch(process.env.ALERT_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, component, kind, message }), signal: AbortSignal.timeout(5000) }).catch(() => undefined);
  }
  if (process.env.ALERT_EMAIL) await sendEmail({ to: process.env.ALERT_EMAIL, subject: text, text, kind: "alert", workspaceId: SYSTEM_WS }).catch(() => undefined);
}

export const FAILURES_TO_OPEN = 2;

/** Store results; open incidents after N consecutive "down", resolve on recovery. */
export async function recordResults(results: ProbeResult[], at = now()) {
  const db = getDb();
  const ins = db.prepare("INSERT INTO health_checks (component, status, latency_ms, message, created_at) VALUES (?, ?, ?, ?, ?)");
  for (const r of results) ins.run(r.component, r.status, r.latencyMs, r.message.slice(0, 500), at);
  const events: { component: string; kind: "opened" | "resolved" }[] = [];
  for (const r of results) {
    const open = db.prepare("SELECT * FROM incidents WHERE component = ? AND status = 'open'").get(r.component) as { id: string } | undefined;
    if (r.status === "down") {
      const last = db.prepare("SELECT status FROM health_checks WHERE component = ? ORDER BY id DESC LIMIT ?").all(r.component, FAILURES_TO_OPEN) as { status: string }[];
      if (!open && last.length >= FAILURES_TO_OPEN && last.every((x) => x.status === "down")) {
        const label = COMPONENTS.find((c) => c.id === r.component)?.label ?? r.component;
        db.prepare("INSERT INTO incidents (id, component, status, title, last_message, started_at) VALUES (?, ?, 'open', ?, ?, ?)").run(newId("inc"), r.component, `${label} is down`, r.message, at);
        events.push({ component: r.component, kind: "opened" });
        await alert("opened", r.component, r.message);
      } else if (open) db.prepare("UPDATE incidents SET last_message = ? WHERE id = ?").run(r.message, open.id);
    } else if (open && (r.status === "ok" || r.status === "disabled")) {
      db.prepare("UPDATE incidents SET status = 'resolved', resolved_at = ?, last_message = ? WHERE id = ?").run(at, `Recovered: ${r.message}`, open.id);
      events.push({ component: r.component, kind: "resolved" });
      await alert("resolved", r.component, r.message);
    }
  }
  db.prepare("DELETE FROM health_checks WHERE created_at < ?").run(new Date(Date.now() - 90 * 864e5).toISOString());
  kvSet("monitor_last_run", at);
  return events;
}

export async function runMonitorOnce(opts: { http?: boolean } = {}) {
  const results = await runProbes(opts);
  await recordResults(results);
  return results;
}

export function overallStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("down")) return "down";
  if (statuses.includes("degraded")) return "degraded";
  return "ok";
}

/** Status page data. */
export function statusSummary() {
  const db = getDb();
  const day = 864e5;
  const comps = COMPONENTS.map((c) => {
    const latest = db.prepare("SELECT status, latency_ms, message, created_at FROM health_checks WHERE component = ? ORDER BY id DESC LIMIT 1").get(c.id) as { status: HealthStatus; latency_ms: number | null; message: string; created_at: string } | undefined;
    const spark = (db.prepare("SELECT latency_ms FROM health_checks WHERE component = ? ORDER BY id DESC LIMIT 30").all(c.id) as { latency_ms: number | null }[]).map((r) => r.latency_ms ?? 0).reverse();
    const daily = db.prepare("SELECT substr(created_at,1,10) AS d, COUNT(*) AS n, SUM(status = 'down') AS down, SUM(status = 'degraded') AS deg FROM health_checks WHERE component = ? AND created_at >= ? GROUP BY d").all(c.id, new Date(Date.now() - 90 * day).toISOString()) as { d: string; n: number; down: number; deg: number }[];
    const byDay = new Map(daily.map((d) => [d.d, d]));
    const bars = Array.from({ length: 90 }, (_, i) => {
      const d = new Date(Date.now() - (89 - i) * day).toISOString().slice(0, 10);
      const r = byDay.get(d);
      const st: HealthStatus | "none" = !r ? "none" : r.down / r.n > 0.2 ? "down" : r.down || r.deg ? "degraded" : "ok";
      return { date: d, status: st, uptime: r ? Math.round(((r.n - r.down) / r.n) * 10000) / 100 : null };
    });
    const totals = db.prepare("SELECT COUNT(*) AS n, SUM(status = 'down') AS down FROM health_checks WHERE component = ? AND created_at >= ?").get(c.id, new Date(Date.now() - 90 * day).toISOString()) as { n: number; down: number | null };
    const t24 = db.prepare("SELECT COUNT(*) AS n, SUM(status = 'down') AS down FROM health_checks WHERE component = ? AND created_at >= ?").get(c.id, new Date(Date.now() - day).toISOString()) as { n: number; down: number | null };
    return {
      ...c, status: (latest?.status ?? "none") as HealthStatus | "none", latencyMs: latest?.latency_ms ?? null, message: latest?.message ?? "No data yet", checkedAt: latest?.created_at ?? null,
      uptime90: totals.n ? Math.round(((totals.n - (totals.down ?? 0)) / totals.n) * 10000) / 100 : null,
      uptime24: t24.n ? Math.round(((t24.n - (t24.down ?? 0)) / t24.n) * 10000) / 100 : null,
      sparkline: spark, bars,
    };
  });
  const incidents = db.prepare("SELECT * FROM incidents ORDER BY started_at DESC LIMIT 30").all() as { id: string; component: string; status: string; title: string; last_message: string | null; started_at: string; resolved_at: string | null }[];
  const live = comps.filter((c) => c.status !== "none" && c.status !== "disabled").map((c) => c.status as HealthStatus);
  return { status: live.length ? overallStatus(live) : ("ok" as HealthStatus), lastRun: kvGet("monitor_last_run"), components: comps, incidents };
}
