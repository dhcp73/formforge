/** Workspace-scoped service layer shared by the REST API, MCP server and dashboard. */
import { getDb, now, parseJson } from "./db";
import { newId } from "./ids";
import { encrypt } from "./secrets";
import * as forms from "./forms";
import * as subs from "./submissions";
import { publicSubmission, reenrichSubmission } from "./processing";
import { createWebhook } from "./webhooks";
import { resolveProvider } from "./integrations/store";
import { researchCompanySearch, createDeepResearch, deepResearchQuery } from "./integrations/valyu";
import { DEEP_RESEARCH_CREDITS } from "./integrations/registry";
import { enqueueJob } from "./jobs";
import { publicUrl, logEnrichment } from "./enrich/pipeline";
import { ApiError } from "./api";
import type { FormRecord } from "./types";

export function publicForm(f: FormRecord & { submissionCount?: number; spamCount?: number; lastSubmissionAt?: string | null }) {
  return {
    id: f.id, name: f.name, description: f.description, status: f.status, endpoint: `${publicUrl()}/api/f/${f.id}`,
    settings: f.settings, created_at: f.createdAt, updated_at: f.updatedAt,
    ...(f.submissionCount !== undefined ? { submission_count: f.submissionCount, spam_count: f.spamCount, last_submission_at: f.lastSubmissionAt } : {}),
  };
}

export const svc = {
  listForms: (ws: string) => forms.listForms(ws).map(publicForm),
  getForm: (ws: string, id: string) => { const f = forms.getForm(ws, id); if (!f) throw new ApiError(404, "Form not found", "not_found"); return publicForm(f); },
  createForm: (ws: string, input: { name: string; description?: string; settings?: Record<string, unknown> }) => publicForm(forms.createForm(ws, input as never)),
  updateForm: (ws: string, id: string, patch: Record<string, unknown>) => { if (!forms.getForm(ws, id)) throw new ApiError(404, "Form not found", "not_found"); return publicForm(forms.updateForm(ws, id, patch as never)); },
  deleteForm: (ws: string, id: string) => { if (!forms.deleteForm(ws, id)) throw new ApiError(404, "Form not found", "not_found"); return { deleted: true, id }; },
  listSubmissions: (ws: string, q: subs.ListQuery) => {
    if (q.formId && !forms.getForm(ws, q.formId)) throw new ApiError(404, "Form not found", "not_found");
    const r = subs.listSubmissions(ws, q);
    return { data: r.data.map(publicSubmission), pagination: { page: r.page, limit: r.limit, total: r.total, total_pages: r.totalPages } };
  },
  getSubmission: (ws: string, id: string) => { const s = subs.getSubmission(ws, id); if (!s) throw new ApiError(404, "Submission not found", "not_found"); return publicSubmission(s); },
  deleteSubmission: (ws: string, id: string) => { if (!subs.deleteSubmission(ws, id)) throw new ApiError(404, "Submission not found", "not_found"); return { deleted: true, id }; },
  updateSubmission: (ws: string, id: string, patch: { status?: string; is_spam?: boolean; owner?: string | null; tags?: string[] }) => {
    if (!subs.getSubmission(ws, id)) throw new ApiError(404, "Submission not found", "not_found");
    return publicSubmission(subs.updateSubmission(ws, id, { status: patch.status, isSpam: patch.is_spam, owner: patch.owner, tags: patch.tags }));
  },
  createWebhook: (ws: string, formId: string, input: unknown) => {
    if (!forms.getForm(ws, formId)) throw new ApiError(404, "Form not found", "not_found");
    const h = createWebhook(ws, formId, input);
    return { id: h.id, form_id: h.formId, url: h.url, events: h.events, include_spam: h.includeSpam, active: h.active, secret: h.secret, created_at: h.createdAt };
  },
  enrichSubmission: async (ws: string, id: string) => {
    if (!subs.getSubmission(ws, id)) throw new ApiError(404, "Submission not found", "not_found");
    return publicSubmission(await reenrichSubmission(ws, id));
  },
  stats: (ws: string) => subs.workspaceStats(ws),
  enrichmentConfig: (ws: string) => (["apollo", "clay", "valyu", "openai", "openrouter", "ai"] as const).map((id) => {
    const r = resolveProvider(ws, id);
    return { provider: id, enabled: r.enabled, configured: r.configured, source: r.source };
  }),
  /** mode "search" = synchronous Valyu Search; fast|standard|heavy|max = async DeepResearch task. */
  researchCompany: async (ws: string, input: { domain?: string; company?: string; mode?: string; submission_id?: string }) => {
    if (!input.domain && !input.company) throw new ApiError(400, "Provide domain or company", "bad_request");
    const cfg = resolveProvider(ws, "valyu");
    if (!cfg.enabled) throw new ApiError(409, "Valyu is not configured. Add an API key in Settings → Integrations or set VALYU_API_KEY.", "provider_disabled");
    const mode = input.mode ?? "search";
    const started = Date.now();
    if (mode === "search") {
      const r = await researchCompanySearch(String(cfg.config.apiKey), { domain: input.domain, company: input.company }, AbortSignal.timeout(30_000));
      logEnrichment(ws, input.submission_id, "valyu", "success", Date.now() - started, { costUsd: r.costUsd, message: "research_company search" });
      return { mode, status: "completed", summary: r.summary, results: r.snippets, cost_usd: r.costUsd };
    }
    if (!["fast", "standard", "heavy", "max"].includes(mode)) throw new ApiError(400, "mode must be search|fast|standard|heavy|max", "bad_request");
    if (input.submission_id && !subs.getSubmission(ws, input.submission_id)) throw new ApiError(404, "Submission not found", "not_found");
    const query = deepResearchQuery({ domain: input.domain, company: input.company });
    const base = publicUrl();
    const task = await createDeepResearch(String(cfg.config.apiKey), { query, mode: mode as "fast", webhookUrl: base.startsWith("https://") ? `${base}/api/integrations/valyu/webhook` : undefined });
    const id = newId("rt");
    getDb().prepare("INSERT INTO research_tasks (id, workspace_id, submission_id, provider, external_id, mode, query, secret_enc, status, created_at, updated_at) VALUES (?, ?, ?, 'valyu', ?, ?, ?, ?, 'running', ?, ?)")
      .run(id, ws, input.submission_id ?? null, task.id, mode, query, task.webhookSecret ? encrypt(task.webhookSecret) : null, now(), now());
    logEnrichment(ws, input.submission_id, "valyu", "pending", Date.now() - started, { credits: DEEP_RESEARCH_CREDITS[mode], message: `deepresearch ${mode}` });
    enqueueJob("research.poll", { taskId: id }, 60_000);
    return { mode, status: "running", task_id: id, external_id: task.id, estimated_credits: DEEP_RESEARCH_CREDITS[mode] };
  },
  getResearch: (ws: string, id: string) => {
    const t = getDb().prepare("SELECT * FROM research_tasks WHERE id = ? AND workspace_id = ?").get(id, ws) as Record<string, unknown> | undefined;
    if (!t) throw new ApiError(404, "Research task not found", "not_found");
    return { id: t.id, status: t.status, mode: t.mode, query: t.query, submission_id: t.submission_id, result: parseJson(t.result, null), error: t.error, created_at: t.created_at, updated_at: t.updated_at };
  },
};
