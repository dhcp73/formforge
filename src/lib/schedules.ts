import fs from "node:fs";
import path from "node:path";
import { CronExpressionParser } from "cron-parser";
import { z } from "zod";
import { dataDir, getDb, now, parseJson } from "./db";
import { newId } from "./ids";
import { getForm } from "./forms";
import { exportSubmissions, toCsv } from "./submissions";
import { sendEmail, escapeHtml } from "./email";
import { signPayload } from "./webhooks";
import { publicSubmission } from "./processing";

export const SCHEDULE_KINDS = ["digest", "webhook_export", "csv_export"] as const;
export const scheduleInputSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(SCHEDULE_KINDS),
  cron: z.string().min(1).refine((c) => { try { CronExpressionParser.parse(c); return true; } catch { return false; } }, "Invalid cron expression"),
  timezone: z.string().default("UTC").refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Invalid timezone"),
  config: z.object({ recipients: z.array(z.string().email()).optional(), url: z.string().url().optional(), includeSpam: z.boolean().optional() }).default({}),
  active: z.boolean().default(true),
}).superRefine((v, ctx) => {
  if (v.kind === "digest" && !v.config.recipients?.length) ctx.addIssue({ code: "custom", path: ["config", "recipients"], message: "Digest needs at least one recipient" });
  if (v.kind === "webhook_export" && !v.config.url) ctx.addIssue({ code: "custom", path: ["config", "url"], message: "Webhook export needs a URL" });
});

export interface Schedule {
  id: string; formId: string; workspaceId: string; name: string; kind: (typeof SCHEDULE_KINDS)[number]; cron: string; timezone: string;
  config: { recipients?: string[]; url?: string; includeSpam?: boolean }; active: boolean; lastRunAt: string | null; lastStatus: string | null; lastDetail: string | null; nextRunAt: string | null; createdAt: string;
}
type Row = Record<string, unknown>;
const map = (r: Row): Schedule => ({
  id: r.id as string, formId: r.form_id as string, workspaceId: r.workspace_id as string, name: r.name as string, kind: r.kind as Schedule["kind"],
  cron: r.cron as string, timezone: r.timezone as string, config: parseJson(r.config, {}), active: !!r.active, lastRunAt: (r.last_run_at as string) ?? null,
  lastStatus: (r.last_status as string) ?? null, lastDetail: (r.last_detail as string) ?? null, nextRunAt: (r.next_run_at as string) ?? null, createdAt: r.created_at as string,
});

export function nextRun(cron: string, tz: string, from = new Date()): string {
  return CronExpressionParser.parse(cron, { currentDate: from, tz }).next().toDate().toISOString();
}

export function createSchedule(ws: string, formId: string, input: unknown): Schedule {
  const v = scheduleInputSchema.parse(input);
  const id = newId("sch");
  getDb().prepare("INSERT INTO schedules (id, form_id, workspace_id, name, kind, cron, timezone, config, active, next_run_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, formId, ws, v.name, v.kind, v.cron, v.timezone, JSON.stringify(v.config), v.active ? 1 : 0, nextRun(v.cron, v.timezone), now());
  return getSchedule(ws, id)!;
}
export function getSchedule(ws: string, id: string) {
  const r = getDb().prepare("SELECT * FROM schedules WHERE id = ? AND workspace_id = ?").get(id, ws) as Row | undefined;
  return r ? map(r) : null;
}
export function listSchedules(ws: string, formId?: string) {
  const rows = (formId ? getDb().prepare("SELECT * FROM schedules WHERE workspace_id = ? AND form_id = ? ORDER BY created_at").all(ws, formId) : getDb().prepare("SELECT * FROM schedules WHERE workspace_id = ? ORDER BY created_at").all(ws)) as Row[];
  return rows.map(map);
}
export function updateSchedule(ws: string, id: string, input: unknown) {
  const cur = getSchedule(ws, id);
  if (!cur) throw new Error("Schedule not found");
  const v = scheduleInputSchema.parse({ ...cur, ...(input as object) });
  getDb().prepare("UPDATE schedules SET name = ?, kind = ?, cron = ?, timezone = ?, config = ?, active = ?, next_run_at = ? WHERE id = ?")
    .run(v.name, v.kind, v.cron, v.timezone, JSON.stringify(v.config), v.active ? 1 : 0, nextRun(v.cron, v.timezone), id);
  return getSchedule(ws, id)!;
}
export function deleteSchedule(ws: string, id: string) {
  return getDb().prepare("DELETE FROM schedules WHERE id = ? AND workspace_id = ?").run(id, ws).changes > 0;
}

/** Execute a schedule now. Covers submissions since the last run (or last 24h on first run). */
export async function runSchedule(scheduleId: string): Promise<{ status: string; detail: string }> {
  const db = getDb();
  const r = db.prepare("SELECT * FROM schedules WHERE id = ?").get(scheduleId) as Row | undefined;
  if (!r) return { status: "failed", detail: "Schedule not found" };
  const s = map(r);
  const form = getForm(s.workspaceId, s.formId);
  const since = s.lastRunAt ?? new Date(Date.now() - 864e5).toISOString();
  const rows = exportSubmissions(s.workspaceId, s.formId, { since, spam: s.config.includeSpam ? "all" : "false" });
  let status = "success";
  let detail = "";
  try {
    if (s.kind === "digest") {
      const spam = (db.prepare("SELECT COUNT(*) AS c FROM submissions WHERE form_id = ? AND is_spam = 1 AND created_at >= ?").get(s.formId, since) as { c: number }).c;
      const lines = rows.slice(-10).reverse().map((x) => `• ${new Date(x.createdAt).toUTCString()} — ${Object.entries(x.data).slice(0, 3).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(" · ")}`);
      const text = `${form?.name ?? "Form"} digest\n\n${rows.length} new submissions since ${since}\n${spam} flagged as spam\n\nLatest:\n${lines.join("\n") || "(none)"}`;
      for (const to of s.config.recipients ?? []) await sendEmail({ to, workspaceId: s.workspaceId, kind: "digest", subject: `Digest · ${form?.name}: ${rows.length} new`, text, html: `<pre>${escapeHtml(text)}</pre>` });
      detail = `Digest sent to ${(s.config.recipients ?? []).length} recipient(s) · ${rows.length} submissions`;
    } else if (s.kind === "webhook_export") {
      const body = JSON.stringify({ event: "schedule.export", schedule: { id: s.id, name: s.name }, form: { id: s.formId, name: form?.name }, since, count: rows.length, submissions: rows.map(publicSubmission) });
      const res = await fetch(s.config.url!, { method: "POST", headers: { "Content-Type": "application/json", "X-FormForge-Signature": signPayload(s.id, body), "User-Agent": "FormForge-Scheduler/1.0" }, body, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`Endpoint responded ${res.status}`);
      detail = `Posted ${rows.length} submissions (HTTP ${res.status})`;
    } else {
      const dir = path.join(dataDir(), "exports");
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${s.formId}-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
      fs.writeFileSync(path.join(dir, filename), toCsv(rows));
      db.prepare("INSERT INTO exports (id, workspace_id, form_id, schedule_id, filename, format, row_count, created_at) VALUES (?, ?, ?, ?, ?, 'csv', ?, ?)").run(newId("exp"), s.workspaceId, s.formId, s.id, filename, rows.length, now());
      detail = `Wrote ${filename} (${rows.length} rows)`;
    }
  } catch (e) { status = "failed"; detail = e instanceof Error ? e.message : String(e); }
  db.prepare("UPDATE schedules SET last_run_at = ?, last_status = ?, last_detail = ?, next_run_at = ? WHERE id = ?").run(now(), status, detail, nextRun(s.cron, s.timezone), s.id);
  return { status, detail };
}

/** Scheduler tick: enqueue due schedules. */
export function dueSchedules(): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT id, cron, timezone FROM schedules WHERE active = 1 AND next_run_at <= ?").all(now()) as { id: string; cron: string; timezone: string }[];
  for (const r of rows) db.prepare("UPDATE schedules SET next_run_at = ? WHERE id = ?").run(nextRun(r.cron, r.timezone), r.id);
  return rows.map((r) => r.id);
}

export function listExports(ws: string, formId?: string) {
  return (formId
    ? getDb().prepare("SELECT * FROM exports WHERE workspace_id = ? AND form_id = ? ORDER BY created_at DESC LIMIT 50").all(ws, formId)
    : getDb().prepare("SELECT * FROM exports WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50").all(ws)) as { id: string; form_id: string; filename: string; row_count: number; created_at: string; schedule_id: string | null }[];
}

export const pubSchedule = (s: Schedule) => ({ id: s.id, form_id: s.formId, name: s.name, kind: s.kind, cron: s.cron, timezone: s.timezone, config: s.config, active: s.active, next_run_at: s.nextRunAt, last_run_at: s.lastRunAt, last_status: s.lastStatus, last_detail: s.lastDetail, created_at: s.createdAt });
