import fs from "node:fs";
import path from "node:path";
import { dataDir, getDb, now } from "../db";
import { newId, sha256 } from "../ids";
import { formAvailability, getFormPublic } from "../forms";
import type { FormRecord, StoredFile, SubmissionMeta } from "../types";
import { applyMapping, coerce, fieldTypesFor, validate } from "./schema";
import { hiddenFields } from "./logic";
import { scoreSpam } from "./spam";
import { rateLimit } from "./ratelimit";
import { contextFor, runInlineEnrichment } from "../enrich/pipeline";
import { enqueueJob } from "../jobs";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const RESERVED = new Set(["_next", "_redirect", "_subject", "_ts", "_format"]);

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function clientIp(req: Request): string | null {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? req.headers.get("cf-connecting-ip") ?? null;
}

function hostOf(v: string | null): string | null {
  if (!v) return null;
  try { return new URL(v).hostname.toLowerCase(); } catch { return null; }
}

export function domainAllowed(allowed: string[], origin: string | null, referer: string | null): boolean {
  if (!allowed.length) return true;
  const host = hostOf(origin) ?? hostOf(referer);
  if (!host) return false;
  return allowed.some((d) => {
    const a = d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!a) return false;
    if (a.startsWith("*.")) return host === a.slice(2) || host.endsWith(a.slice(1));
    return host === a || host === `www.${a}`;
  });
}

interface Parsed { data: Record<string, unknown>; files: File[] }

export async function parseBody(req: Request): Promise<Parsed> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => { throw new IngestError(400, "Invalid JSON body"); });
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new IngestError(400, "JSON body must be an object");
    return { data: body as Record<string, unknown>, files: [] };
  }
  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    const fd = await req.formData().catch(() => { throw new IngestError(400, "Could not parse form body"); });
    const data: Record<string, unknown> = {};
    const files: File[] = [];
    for (const [rawKey, v] of fd.entries()) {
      const key = rawKey.replace(/\[\]$/, "");
      if (typeof v === "string") {
        if (key in data) data[key] = Array.isArray(data[key]) ? [...(data[key] as unknown[]), v] : [data[key], v];
        else data[key] = v;
      } else if (v.size > 0) {
        Object.defineProperty(v, "__field", { value: key });
        files.push(v);
      }
    }
    return { data, files };
  }
  if (!ct || ct.includes("text/plain")) {
    const text = await req.text();
    try { const j = JSON.parse(text); if (j && typeof j === "object") return { data: j, files: [] }; } catch { /* fallthrough */ }
    return { data: Object.fromEntries(new URLSearchParams(text)), files: [] };
  }
  throw new IngestError(415, `Unsupported content type: ${ct}`);
}

export class IngestError extends Error {
  constructor(public status: number, message: string, public errors?: Record<string, string>, public code?: string) { super(message); }
}

export interface IngestResult { id: string; isSpam: boolean; spamScore: number; form: FormRecord }

/** Core ingest pipeline (framework-agnostic). */
export async function ingest(formId: string, req: Request): Promise<IngestResult & { redirect: string | null }> {
  const form = getFormPublic(formId);
  if (!form) throw new IngestError(404, "Form not found", undefined, "form_not_found");
  const s = form.settings;
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const reqHost = new URL(req.url).host;
  const hosted = !!referer && (() => { try { const r = new URL(referer); return r.host === reqHost && r.pathname === `/f/${formId}`; } catch { return false; } })();
  if (!hosted && !domainAllowed(s.allowedDomains, origin, referer)) throw new IngestError(403, "This domain is not allowed to submit to this form", undefined, "domain_not_allowed");
  const avail = formAvailability(form);
  if (!avail.open) throw new IngestError(avail.reason === "paused" ? 403 : 410, s.closedMessage, undefined, avail.reason);
  const ip = clientIp(req);
  const rl = rateLimit(`${form.id}:${ip ?? "unknown"}`, s.rateLimitPerMinute);
  if (!rl.ok) throw new IngestError(429, `Too many submissions. Try again in ${rl.retryAfterS}s.`, undefined, "rate_limited");

  const { data: rawData, files } = await parseBody(req);
  const honeypotValue = rawData[s.honeypotField];
  const honeypotTriggered = typeof honeypotValue === "string" ? honeypotValue.trim() !== "" : honeypotValue != null && honeypotValue !== false;
  const redirectField = typeof rawData._next === "string" ? rawData._next : typeof rawData._redirect === "string" ? rawData._redirect : null;
  const subject = typeof rawData._subject === "string" ? rawData._subject : null;
  const ts = Number(rawData._ts);
  const elapsedMs = Number.isFinite(ts) && ts > 1e12 ? Date.now() - ts : null;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawData)) if (k !== s.honeypotField && !RESERVED.has(k) && !k.startsWith("$")) data[k] = v;
  if (!Object.keys(data).length && !files.length) throw new IngestError(422, "Submission is empty", { _form: "Send at least one field" }, "empty");

  const fileFields = files.map((f) => (f as File & { __field: string }).__field);
  const errors = validate(data, fileFields, s);
  let total = 0;
  for (const f of files) {
    total += f.size;
    if (f.size > MAX_FILE_BYTES) errors[(f as File & { __field: string }).__field] = `File "${f.name}" exceeds 10 MB`;
  }
  if (total > MAX_TOTAL_BYTES) errors._files = "Total upload size exceeds 25 MB";
  if (Object.keys(errors).length) throw new IngestError(422, "Validation failed", errors, "validation_failed");
  // branching: values for fields hidden by showIf logic are dropped so stale answers never get stored
  for (const name of hiddenFields(s.fields, data)) delete data[name];

  const mapped = applyMapping(data, s);
  const fieldTypes = fieldTypesFor(mapped, s);
  for (const [k, t] of Object.entries(fieldTypes)) mapped[k] = coerce(t, mapped[k]);
  if (subject) mapped._subject = subject;

  const id = newId("sub", 18);
  const meta: SubmissionMeta = { ip, userAgent: req.headers.get("user-agent"), referer, origin, contentType: req.headers.get("content-type") };
  const ctx = contextFor(form.workspaceId, mapped, meta, id);
  const enrichment = await runInlineEnrichment(ctx, s.enrichment);

  const contentHash = sha256(JSON.stringify(Object.entries(mapped).sort()));
  const db = getDb();
  const duplicate = s.duplicateWindowMinutes > 0 && !!db.prepare("SELECT 1 FROM submissions WHERE form_id = ? AND content_hash = ? AND created_at >= ?").get(form.id, contentHash, new Date(Date.now() - s.duplicateWindowMinutes * 60_000).toISOString());
  const ua = enrichment.userAgent as { isBot?: boolean } | undefined;
  const spam = scoreSpam({ data: mapped, honeypotTriggered, email: enrichment.email as never, userAgent: meta.userAgent, isBot: ua?.isBot, duplicate, elapsedMs });
  const isSpam = spam.score >= s.spamThreshold;
  if (isSpam && s.spamAction === "reject" && !honeypotTriggered) throw new IngestError(422, "Submission rejected as spam", { _form: "Looks like spam" }, "spam_rejected");

  const stored: StoredFile[] = [];
  if (files.length) {
    const dir = path.join(dataDir(), "uploads", id);
    fs.mkdirSync(dir, { recursive: true });
    for (const [i, f] of files.entries()) {
      const safe = `${i}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "file"}`;
      const p = path.join(dir, safe);
      fs.writeFileSync(p, Buffer.from(await f.arrayBuffer()));
      stored.push({ field: (f as File & { __field: string }).__field, name: f.name, size: f.size, type: f.type || "application/octet-stream", path: p });
    }
    for (const sf of stored) { mapped[sf.field] = sf.name; fieldTypes[sf.field] = "file"; }
  }

  const searchText = [JSON.stringify(mapped), (enrichment.company as { name?: string })?.name ?? "", (enrichment.geo as { countryName?: string })?.countryName ?? ""].join(" ").toLowerCase().slice(0, 8000);
  const activity = [{ at: now(), type: "received", message: `Received via ${meta.contentType?.split(";")[0] ?? "unknown"}${isSpam ? ` · flagged as spam (${spam.score})` : ""}` }];
  db.prepare(
    `INSERT INTO submissions (id, form_id, workspace_id, data, field_types, files, meta, enrichment, spam_score, is_spam, spam_reasons, status, content_hash, search_text, activity, enrichment_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, 'pending', ?)`,
  ).run(id, form.id, form.workspaceId, JSON.stringify(mapped), JSON.stringify(fieldTypes), JSON.stringify(stored), JSON.stringify(meta), JSON.stringify(enrichment), spam.score, isSpam ? 1 : 0, JSON.stringify(spam.reasons), contentHash, searchText, JSON.stringify(activity), now());

  enqueueJob("submission.process", { submissionId: id });
  const redirect = redirectField && /^https?:\/\//.test(redirectField) ? redirectField : s.redirectUrl || null;
  return { id, isSpam, spamScore: spam.score, form, redirect };
}

export function wantsJson(req: Request): boolean {
  const accept = req.headers.get("accept") ?? "";
  const ct = req.headers.get("content-type") ?? "";
  return accept.includes("application/json") || ct.includes("application/json") || req.headers.get("x-requested-with") === "XMLHttpRequest";
}

/** HTTP wrapper used by the /api/f/[formId] route. */
export async function handleSubmissionRequest(req: Request, formId: string, baseUrl: string): Promise<Response> {
  const cors = corsHeaders(req.headers.get("origin"));
  const json = wantsJson(req);
  try {
    const r = await ingest(formId, req);
    if (json) return Response.json({ ok: true, status: "success", id: r.id, spam: r.isSpam }, { status: 200, headers: cors });
    const target = r.redirect ?? `${baseUrl}/thanks?form=${encodeURIComponent(formId)}${req.headers.get("referer") ? `&back=${encodeURIComponent(req.headers.get("referer")!)}` : ""}`;
    return new Response(null, { status: 303, headers: { ...cors, Location: target } });
  } catch (e) {
    const err = e instanceof IngestError ? e : new IngestError(500, "Unexpected error");
    if (!(e instanceof IngestError)) console.error("[ingest]", e);
    const headers: Record<string, string> = { ...cors };
    if (err.status === 429) headers["Retry-After"] = "60";
    if (json) return Response.json({ ok: false, status: "error", code: err.code ?? "error", message: err.message, errors: err.errors ?? {} }, { status: err.status, headers });
    const params = new URLSearchParams({ form: formId, error: err.message });
    if (err.errors) params.set("details", Object.values(err.errors).join(" · "));
    if (req.headers.get("referer")) params.set("back", req.headers.get("referer")!);
    return new Response(null, { status: 303, headers: { ...headers, Location: `${baseUrl}/thanks?${params}` } });
  }
}
