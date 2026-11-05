import { getDb } from "./db";
import { getFormPublic } from "./forms";
import { getSubmissionById, addActivity } from "./submissions";
import { contextFor, runProviderEnrichment } from "./enrich/pipeline";
import { mergeFields } from "./enrich/merge";
import type { Enrichment, ProviderId } from "./enrich/types";
import { routeSubmission } from "./routing";
import { listWebhooks, createDelivery } from "./webhooks";
import { enqueueJob } from "./jobs";
import { sendEmail, escapeHtml } from "./email";
import type { SubmissionRecord } from "./types";

export function publicSubmission(s: SubmissionRecord) {
  return {
    id: s.id, form_id: s.formId, created_at: s.createdAt, data: s.data, field_types: s.fieldTypes,
    files: s.files.map((f, i) => ({ field: f.field, name: f.name, size: f.size, type: f.type, url: `/api/v1/submissions/${s.id}/files/${i}` })),
    enrichment: s.enrichment, spam: { score: s.spamScore, is_spam: s.isSpam, reasons: s.spamReasons },
    routing: s.routing, owner: s.owner, tags: s.tags, fit_score: s.fitScore, status: s.status, enrichment_status: s.enrichmentStatus,
    meta: { referer: s.meta.referer, origin: s.meta.origin },
  };
}

function saveEnrichment(id: string, e: Enrichment, status?: string) {
  getDb().prepare("UPDATE submissions SET enrichment = ?, fit_score = COALESCE(?, fit_score)" + (status ? ", enrichment_status = ?" : "") + " WHERE id = ?")
    .run(...([JSON.stringify(e), typeof e.fitScore === "number" ? e.fitScore : null, ...(status ? [status] : []), id] as unknown[]));
}

/** Apply routing decision (owner/tags/spam) and fire rule actions. */
export async function applyRouting(s: SubmissionRecord) {
  const { decision, matched } = routeSubmission(s.workspaceId, s);
  const tags = Array.from(new Set([...s.tags, ...decision.tags]));
  getDb().prepare("UPDATE submissions SET routing = ?, owner = COALESCE(?, owner), tags = ? WHERE id = ?").run(JSON.stringify(decision), decision.owner, JSON.stringify(tags), s.id);
  addActivity(s.id, { type: "routing", message: matched.length ? `Routed by "${matched.map((m) => m.name).join(", ")}"${decision.owner ? ` → ${decision.owner}` : ""}` : "No routing rule matched" });
  for (const rule of matched) {
    if (rule.actions.markSpam) getDb().prepare("UPDATE submissions SET is_spam = 1 WHERE id = ?").run(s.id);
    for (const to of rule.actions.notifyEmails) {
      await sendEmail({ to, workspaceId: s.workspaceId, kind: "routing", subject: `[Routing] ${rule.name}: new lead`, text: `Rule "${rule.name}" matched submission ${s.id}.\nOwner: ${decision.owner ?? "—"}\n\n${JSON.stringify(s.data, null, 2)}` });
    }
    if (rule.actions.webhookUrl) {
      enqueueJob("routing.webhook", { url: rule.actions.webhookUrl, payload: { event: "submission.routed", rule: { id: rule.id, name: rule.name }, owner: decision.owner, submission: publicSubmission(getSubmissionById(s.id)!) } });
    }
  }
  return decision;
}

function fireWebhooks(s: SubmissionRecord, event: string) {
  const form = getFormPublic(s.formId);
  for (const hook of listWebhooks(s.workspaceId, s.formId)) {
    if (!hook.active || !hook.events.includes(event)) continue;
    if (s.isSpam && !hook.includeSpam) continue;
    const id = createDelivery(hook, event, { event, created_at: new Date().toISOString(), form: { id: s.formId, name: form?.name }, submission: publicSubmission(s) }, s.id);
    enqueueJob("webhook.deliver", { deliveryId: id });
  }
}

async function sendNotifications(s: SubmissionRecord) {
  const form = getFormPublic(s.formId);
  if (!form) return;
  const st = form.settings;
  if (s.isSpam && !st.notifyOnSpam) return;
  const subject = typeof s.data._subject === "string" ? s.data._subject : `New submission · ${form.name}`;
  const rows = Object.entries(s.data).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n");
  const e = s.enrichment as { company?: { name?: string; employees?: number }; geo?: { countryName?: string } };
  const extra = [e.company?.name && `Company: ${e.company.name}${e.company.employees ? ` (${e.company.employees} employees)` : ""}`, e.geo?.countryName && `Country: ${e.geo.countryName}`, s.fitScore != null && `Fit score: ${s.fitScore}`, s.owner && `Owner: ${s.owner}`].filter(Boolean).join("\n");
  for (const to of st.notifyEmails) {
    await sendEmail({
      to, workspaceId: s.workspaceId, kind: "notification", subject,
      text: `${rows}\n\n${extra}\n\nView: ${(process.env.PUBLIC_URL || "http://localhost:3100")}/dashboard/forms/${s.formId}?s=${s.id}`,
      html: `<h2>${escapeHtml(form.name)}</h2><table>${Object.entries(s.data).map(([k, v]) => `<tr><td><b>${escapeHtml(k)}</b></td><td>${escapeHtml(String(typeof v === "object" ? JSON.stringify(v) : v))}</td></tr>`).join("")}</table><pre>${escapeHtml(extra)}</pre>`,
    });
  }
  const email = (s.enrichment as { email?: { address?: string; valid?: boolean } }).email;
  if (st.autoresponder.enabled && email?.address && email.valid !== false && !s.isSpam) {
    const name = String(s.data.name ?? s.data.first_name ?? "there");
    await sendEmail({ to: email.address, workspaceId: s.workspaceId, kind: "autoresponder", subject: st.autoresponder.subject, text: st.autoresponder.body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (k === "name" ? name : String(s.data[k] ?? ""))) });
  }
}

/** Background job: provider enrichment → routing → webhooks + notifications. */
export async function processSubmission(submissionId: string) {
  const s = getSubmissionById(submissionId);
  if (!s) return;
  const form = getFormPublic(s.formId);
  if (!form) return;
  const e = s.enrichment as Enrichment;
  e.attribution ??= {};
  e.providers ??= {};
  if (!s.isSpam) {
    const ctx = contextFor(s.workspaceId, s.data, { ip: s.meta.ip, userAgent: s.meta.userAgent }, s.id);
    await runProviderEnrichment(ctx, e, form.settings.enrichment, s.formId);
    const ran = Object.values(e.providers).some((p) => p && ["success", "error", "timeout", "cache_hit", "pending"].includes(p.status) && p !== e.providers.offline && p !== e.providers.ipgeo);
    saveEnrichment(s.id, e, ran ? "complete" : "complete");
    addActivity(s.id, { type: "enrichment", message: `Enrichment finished (${Object.entries(e.providers).map(([k, v]) => `${k}: ${v?.status}`).join(", ")})` });
  } else {
    saveEnrichment(s.id, e, "skipped");
  }
  const fresh = getSubmissionById(s.id)!;
  if (!fresh.isSpam) await applyRouting(fresh);
  const routed = getSubmissionById(s.id)!;
  fireWebhooks(routed, "submission.created");
  if (!routed.isSpam) {
    fireWebhooks(routed, "submission.enriched");
    // Also emit aliases some docs/clients expect
    fireWebhooks(routed, "enrichment.completed");
    if (routed.owner || (routed.routing && "owner" in routed.routing && (routed.routing as { owner?: string | null }).owner)) {
      fireWebhooks(routed, "submission.routed");
      fireWebhooks(routed, "routing.assigned");
    }
  }
  await sendNotifications(routed);
}

/** Merge late-arriving provider data (Clay callback, Valyu DeepResearch) and optionally re-route. */
export async function mergeIntoSubmission(submissionId: string, source: ProviderId, fields: Record<string, unknown>, opts: { message?: string; rerunRouting?: boolean; research?: Record<string, unknown>; raw?: unknown } = {}) {
  const s = getSubmissionById(submissionId);
  if (!s) throw new Error("Submission not found");
  const e = s.enrichment as Enrichment;
  e.attribution ??= {};
  e.providers ??= {};
  const written = mergeFields(e, source, fields);
  e.providers[source] = { status: "success", ms: 0, message: opts.message, raw: opts.raw ?? e.providers[source]?.raw };
  if (opts.research) e.research = { ...(e.research ?? {}), deepResearch: { ...((e.research as { deepResearch?: object })?.deepResearch ?? {}), ...opts.research } };
  const ai = e.ai as { icpScore?: number } | undefined;
  if (typeof ai?.icpScore !== "number") {
    const { heuristicFit } = await import("./enrich/pipeline");
    e.fitScore = heuristicFit(e, s.data);
  }
  saveEnrichment(s.id, e, "complete");
  addActivity(s.id, { type: "enrichment", message: `${opts.message ?? `${source} data merged`} (${written.length} fields)` });
  if (opts.rerunRouting !== false) await applyRouting(getSubmissionById(s.id)!);
  const fresh = getSubmissionById(s.id)!;
  fireWebhooks(fresh, "submission.enriched");
  fireWebhooks(fresh, "enrichment.completed");
  if (fresh.owner) {
    fireWebhooks(fresh, "submission.routed");
    fireWebhooks(fresh, "routing.assigned");
  }
  return written;
}

/** Manual re-enrich (REST/MCP/dashboard): reruns inline + provider enrichment and routing. */
export async function reenrichSubmission(workspaceId: string, submissionId: string) {
  const s = getSubmissionById(submissionId);
  if (!s || s.workspaceId !== workspaceId) throw new Error("Submission not found");
  const form = getFormPublic(s.formId)!;
  const { runInlineEnrichment } = await import("./enrich/pipeline");
  const ctx = contextFor(workspaceId, s.data, { ip: s.meta.ip, userAgent: s.meta.userAgent }, s.id);
  const e = await runInlineEnrichment(ctx, form.settings.enrichment);
  await runProviderEnrichment(ctx, e, { ...form.settings.enrichment, deepResearch: false }, s.formId);
  saveEnrichment(s.id, e, "complete");
  addActivity(s.id, { type: "enrichment", message: "Re-enriched manually" });
  await applyRouting(getSubmissionById(s.id)!);
  return getSubmissionById(s.id)!;
}
