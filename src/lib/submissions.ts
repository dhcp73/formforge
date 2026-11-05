import fs from "node:fs";
import { getDb, now, parseJson } from "./db";
import type { ActivityEntry, SubmissionRecord } from "./types";

type Row = Record<string, unknown> & { id: string };

export function mapSubmission(r: Row): SubmissionRecord {
  return {
    id: r.id, formId: r.form_id as string, workspaceId: r.workspace_id as string,
    data: parseJson(r.data, {}), fieldTypes: parseJson(r.field_types, {}), files: parseJson(r.files, []),
    meta: parseJson(r.meta, { ip: null, userAgent: null, referer: null, origin: null, contentType: null }),
    enrichment: parseJson(r.enrichment, {}), spamScore: Number(r.spam_score ?? 0), isSpam: !!r.is_spam,
    spamReasons: parseJson(r.spam_reasons, []), status: (r.status as SubmissionRecord["status"]) ?? "new",
    owner: (r.owner as string) ?? null, tags: parseJson(r.tags, []), routing: parseJson(r.routing, {}),
    fitScore: r.fit_score == null ? null : Number(r.fit_score), enrichmentStatus: (r.enrichment_status as SubmissionRecord["enrichmentStatus"]) ?? "pending",
    activity: parseJson(r.activity, []), createdAt: r.created_at as string,
  };
}

export interface ListQuery {
  formId?: string;
  q?: string;
  spam?: "true" | "false" | "all";
  status?: string;
  owner?: string;
  tag?: string;
  since?: string;
  until?: string;
  minFit?: number;
  page?: number;
  limit?: number;
  sort?: "created_at" | "fit_score" | "spam_score";
  order?: "asc" | "desc";
}

export function listSubmissions(workspaceId: string, q: ListQuery = {}) {
  const where: string[] = ["workspace_id = ?"];
  const args: unknown[] = [workspaceId];
  if (q.formId) { where.push("form_id = ?"); args.push(q.formId); }
  const spam = q.spam ?? "false";
  if (spam === "true") where.push("is_spam = 1");
  else if (spam === "false") where.push("is_spam = 0");
  if (q.status) { where.push("status = ?"); args.push(q.status); }
  if (q.owner) { where.push("owner = ?"); args.push(q.owner); }
  if (q.tag) { where.push("EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)"); args.push(q.tag); }
  if (q.since) { where.push("created_at >= ?"); args.push(new Date(q.since).toISOString()); }
  if (q.until) { where.push("created_at <= ?"); args.push(new Date(q.until).toISOString()); }
  if (q.minFit != null && !Number.isNaN(q.minFit)) { where.push("fit_score >= ?"); args.push(q.minFit); }
  if (q.q?.trim()) {
    for (const term of q.q.trim().toLowerCase().split(/\s+/).slice(0, 5)) { where.push("search_text LIKE ?"); args.push(`%${term}%`); }
  }
  const limit = Math.min(Math.max(Number(q.limit) || 25, 1), 200);
  const page = Math.max(Number(q.page) || 1, 1);
  const sort = ["created_at", "fit_score", "spam_score"].includes(q.sort ?? "") ? q.sort! : "created_at";
  const order = q.order === "asc" ? "ASC" : "DESC";
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM submissions WHERE ${where.join(" AND ")}`).get(...args) as { c: number }).c;
  const rows = db
    .prepare(`SELECT * FROM submissions WHERE ${where.join(" AND ")} ORDER BY ${sort} ${order} NULLS LAST, id DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, (page - 1) * limit) as Row[];
  return { data: rows.map(mapSubmission), page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export function getSubmission(workspaceId: string, id: string): SubmissionRecord | null {
  const r = getDb().prepare("SELECT * FROM submissions WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as Row | undefined;
  return r ? mapSubmission(r) : null;
}

export function getSubmissionById(id: string): SubmissionRecord | null {
  const r = getDb().prepare("SELECT * FROM submissions WHERE id = ?").get(id) as Row | undefined;
  return r ? mapSubmission(r) : null;
}

export function deleteSubmission(workspaceId: string, id: string): boolean {
  const s = getSubmission(workspaceId, id);
  if (!s) return false;
  for (const f of s.files) { try { fs.unlinkSync(f.path); } catch { /* ignore */ } }
  return getDb().prepare("DELETE FROM submissions WHERE id = ? AND workspace_id = ?").run(id, workspaceId).changes > 0;
}

export function updateSubmission(workspaceId: string, id: string, patch: { status?: string; isSpam?: boolean; owner?: string | null; tags?: string[] }) {
  const s = getSubmission(workspaceId, id);
  if (!s) throw new Error("Submission not found");
  const db = getDb();
  if (patch.status && ["new", "read", "archived"].includes(patch.status)) db.prepare("UPDATE submissions SET status = ? WHERE id = ?").run(patch.status, id);
  if (patch.isSpam !== undefined) {
    db.prepare("UPDATE submissions SET is_spam = ? WHERE id = ?").run(patch.isSpam ? 1 : 0, id);
    addActivity(id, { type: "spam", message: patch.isSpam ? "Marked as spam" : "Marked as not spam" });
  }
  if (patch.owner !== undefined) { db.prepare("UPDATE submissions SET owner = ? WHERE id = ?").run(patch.owner, id); addActivity(id, { type: "owner", message: `Owner set to ${patch.owner ?? "nobody"}` }); }
  if (patch.tags) db.prepare("UPDATE submissions SET tags = ? WHERE id = ?").run(JSON.stringify(patch.tags), id);
  return getSubmission(workspaceId, id)!;
}

export function addActivity(id: string, entry: Omit<ActivityEntry, "at">) {
  const db = getDb();
  const r = db.prepare("SELECT activity FROM submissions WHERE id = ?").get(id) as { activity: string } | undefined;
  if (!r) return;
  const list = parseJson<ActivityEntry[]>(r.activity, []);
  list.push({ at: now(), ...entry });
  db.prepare("UPDATE submissions SET activity = ? WHERE id = ?").run(JSON.stringify(list.slice(-200)), id);
}

/** All distinct data keys across a form's submissions (dynamic columns). */
export function formColumns(workspaceId: string, formId: string): string[] {
  const rows = getDb()
    .prepare("SELECT DISTINCT j.key AS k FROM submissions s, json_each(s.data) j WHERE s.workspace_id = ? AND s.form_id = ? LIMIT 200")
    .all(workspaceId, formId) as { k: string }[];
  return rows.map((r) => r.k);
}

export function toCsv(rows: SubmissionRecord[]): string {
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.data))));
  const enrichCols = ["company_domain", "company_name", "country", "fit_score", "owner", "tags", "spam_score", "is_spam"];
  const header = ["id", "created_at", ...keys, ...enrichCols];
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // CSV injection guard
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    const e = r.enrichment as { company?: { domain?: string; name?: string }; geo?: { country?: string } };
    lines.push([
      r.id, r.createdAt, ...keys.map((k) => r.data[k]),
      e.company?.domain, e.company?.name, e.geo?.country, r.fitScore, r.owner, r.tags.join("|"), r.spamScore, r.isSpam,
    ].map(esc).join(","));
  }
  return lines.join("\n") + "\n";
}

export function exportSubmissions(workspaceId: string, formId: string, opts: { since?: string; spam?: "true" | "false" | "all" } = {}) {
  const all: SubmissionRecord[] = [];
  let page = 1;
  for (;;) {
    const res = listSubmissions(workspaceId, { formId, since: opts.since, spam: opts.spam ?? "false", limit: 200, page, order: "asc" });
    all.push(...res.data);
    if (page >= res.totalPages) break;
    page++;
  }
  return all;
}

export function workspaceStats(workspaceId: string, days = 14) {
  const db = getDb();
  const since = new Date(Date.now() - days * 864e5);
  since.setUTCHours(0, 0, 0, 0);
  const rows = db
    .prepare("SELECT substr(created_at, 1, 10) AS d, SUM(is_spam = 0) AS ok, SUM(is_spam = 1) AS spam FROM submissions WHERE workspace_id = ? AND created_at >= ? GROUP BY d")
    .all(workspaceId, since.toISOString()) as { d: string; ok: number; spam: number }[];
  const byDay = new Map(rows.map((r) => [r.d, r]));
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(since.getTime() + i * 864e5).toISOString().slice(0, 10);
    const r = byDay.get(d);
    return { date: d, submissions: r?.ok ?? 0, spam: r?.spam ?? 0 };
  });
  const totals = db
    .prepare("SELECT COUNT(*) AS total, SUM(is_spam = 1) AS spam, SUM(is_spam = 0 AND created_at >= ?) AS week, AVG(CASE WHEN is_spam = 0 THEN fit_score END) AS fit FROM submissions WHERE workspace_id = ?")
    .get(new Date(Date.now() - 7 * 864e5).toISOString(), workspaceId) as { total: number; spam: number | null; week: number | null; fit: number | null };
  const forms = (db.prepare("SELECT COUNT(*) AS c FROM forms WHERE workspace_id = ?").get(workspaceId) as { c: number }).c;
  const owners = db
    .prepare("SELECT COALESCE(owner, 'Unassigned') AS owner, COUNT(*) AS count FROM submissions WHERE workspace_id = ? AND is_spam = 0 GROUP BY owner ORDER BY count DESC LIMIT 8")
    .all(workspaceId) as { owner: string; count: number }[];
  const providers = db
    .prepare("SELECT provider, COUNT(*) AS total, SUM(status = 'success' OR status = 'cache_hit') AS hits FROM enrichment_logs WHERE workspace_id = ? GROUP BY provider ORDER BY provider")
    .all(workspaceId) as { provider: string; total: number; hits: number }[];
  const countries = db
    .prepare("SELECT json_extract(enrichment, '$.geo.country') AS c, COUNT(*) AS n FROM submissions WHERE workspace_id = ? AND is_spam = 0 AND c IS NOT NULL GROUP BY c ORDER BY n DESC LIMIT 6")
    .all(workspaceId) as { c: string; n: number }[];
  return {
    series,
    total: totals.total ?? 0,
    spam: totals.spam ?? 0,
    last7: totals.week ?? 0,
    avgFit: totals.fit == null ? null : Math.round(totals.fit),
    spamRate: totals.total ? Math.round(((totals.spam ?? 0) / totals.total) * 1000) / 10 : 0,
    forms,
    owners,
    providers: providers.map((p) => ({ ...p, hitRate: p.total ? Math.round((p.hits / p.total) * 100) : 0 })),
    countries,
  };
}

export function distinctOwners(workspaceId: string, formId?: string): string[] {
  const rows = getDb().prepare(`SELECT DISTINCT owner FROM submissions WHERE workspace_id = ? ${formId ? "AND form_id = ?" : ""} AND owner IS NOT NULL ORDER BY owner`).all(...(formId ? [workspaceId, formId] : [workspaceId])) as { owner: string }[];
  return rows.map((r) => r.owner);
}

export function parseListParams(sp: Record<string, string | string[] | undefined>): ListQuery {
  const g = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const spam = g("spam");
  return {
    q: g("q"), status: g("status"), owner: g("owner"), tag: g("tag"),
    spam: spam === "true" || spam === "all" ? spam : "false",
    minFit: g("minFit") ? Number(g("minFit")) : undefined,
    page: Number(g("page")) || 1, limit: Number(g("limit")) || 25,
    sort: (g("sort") as ListQuery["sort"]) ?? "created_at", order: g("order") === "asc" ? "asc" : "desc",
  };
}
