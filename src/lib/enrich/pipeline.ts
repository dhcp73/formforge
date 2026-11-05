import { getDb, now, parseJson } from "../db";
import { newId } from "../ids";
import { encrypt, decrypt } from "../secrets";
import { resolveProvider, recordTest, saveProvider } from "../integrations/store";
import type { IntegrationId } from "../integrations/registry";
import { ApolloClient, apolloToFields } from "../integrations/apollo";
import { sendToClay, clayToFields } from "../integrations/clay";
import { researchCompanySearch, createDeepResearch, deepResearchQuery, getDeepResearchStatus, parseDeepResearchOutput, deepResearchToFields } from "../integrations/valyu";
import { runAiEnrichment, buildPrompt, aiToFields, testOpenAI, testOpenRouter, type AiProviderConfig } from "../integrations/ai";
import { LOCAL_ENRICHERS, extractHints } from "./local";
import { emptyEnrichment, mergeFields } from "./merge";
import { DEEP_RESEARCH_CREDITS } from "../integrations/registry";
import type { Enricher, EnricherResult, Enrichment, EnrichmentContext, ProviderId } from "./types";
import type { FormSettings } from "../types";

export const PROVIDER_TIMEOUT_MS = Number(process.env.FORMFORGE_PROVIDER_TIMEOUT_MS || 15_000);
const CACHE_TTL_MS = 7 * 864e5;

export function publicUrl() {
  return (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3100}`).replace(/\/$/, "");
}

export function logEnrichment(ws: string, submissionId: string | undefined, provider: string, status: string, ms: number, extra: { credits?: number; costUsd?: number; message?: string } = {}) {
  getDb()
    .prepare("INSERT INTO enrichment_logs (id, workspace_id, submission_id, provider, status, duration_ms, credits, cost_usd, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(newId("elog"), ws, submissionId ?? null, provider, status, Math.round(ms), extra.credits ?? 0, extra.costUsd ?? 0, extra.message?.slice(0, 500) ?? null, now());
}

function cacheGet(provider: string, key: string): EnricherResult | null {
  const r = getDb().prepare("SELECT value, expires_at FROM enrichment_cache WHERE provider = ? AND cache_key = ?").get(provider, key) as { value: string; expires_at: string } | undefined;
  if (!r || r.expires_at < now()) return null;
  return parseJson<EnricherResult | null>(r.value, null);
}
function cacheSet(provider: string, key: string, value: EnricherResult) {
  getDb().prepare("INSERT OR REPLACE INTO enrichment_cache (provider, cache_key, value, expires_at) VALUES (?, ?, ?, ?)").run(provider, key, JSON.stringify(value), new Date(Date.now() + CACHE_TTL_MS).toISOString());
}

export function contextFor(workspaceId: string, data: Record<string, unknown>, meta: { ip: string | null; userAgent: string | null }, submissionId?: string): EnrichmentContext {
  const h = extractHints(data);
  return { workspaceId, submissionId, data, email: h.email, domain: h.domain, companyName: h.companyName, ip: meta.ip, userAgent: meta.userAgent };
}

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      fn(ctl.signal),
      new Promise<never>((_, rej) => { timer = setTimeout(() => { ctl.abort(); rej(new TimeoutError(`timed out after ${ms}ms`)); }, ms); }),
    ]);
  } finally { clearTimeout(timer); }
}
class TimeoutError extends Error {}

/** Runs one enricher with timeout, cache, logging and attribution. Never throws. */
export async function runEnricher(e: Enricher, ctx: EnrichmentContext, enrichment: Enrichment, opts: { cacheKey?: string | null; log?: boolean } = {}) {
  const started = Date.now();
  try {
    if (!(await e.isEnabled(ctx))) { enrichment.providers[e.id] = { status: "skipped", ms: 0 }; return; }
    // cache is per-workspace so one tenant's paid provider data never leaks to another
    const cacheKey = opts.cacheKey ? `${ctx.workspaceId}:${opts.cacheKey}` : null;
    if (cacheKey) {
      const hit = cacheGet(e.id, cacheKey);
      if (hit) {
        mergeFields(enrichment, e.id, hit.fields);
        enrichment.providers[e.id] = { status: "cache_hit", ms: Date.now() - started, raw: hit.raw };
        if (opts.log !== false) logEnrichment(ctx.workspaceId, ctx.submissionId, e.id, "cache_hit", Date.now() - started);
        return;
      }
    }
    const res = await withTimeout(e.timeoutMs, (signal) => e.run(ctx, signal));
    const ms = Date.now() - started;
    if (!res) {
      enrichment.providers[e.id] = { status: "no_data", ms };
      if (opts.log !== false) logEnrichment(ctx.workspaceId, ctx.submissionId, e.id, "no_data", ms);
      return;
    }
    mergeFields(enrichment, e.id, res.fields);
    enrichment.providers[e.id] = { status: "success", ms, raw: res.raw };
    if (cacheKey) cacheSet(e.id, cacheKey, res);
    if (opts.log !== false) logEnrichment(ctx.workspaceId, ctx.submissionId, e.id, "success", ms, { credits: res.credits, costUsd: res.costUsd });
  } catch (err) {
    const ms = Date.now() - started;
    const timeout = err instanceof TimeoutError;
    const message = err instanceof Error ? err.message : String(err);
    enrichment.providers[e.id] = { status: timeout ? "timeout" : "error", ms, message };
    if (opts.log !== false) logEnrichment(ctx.workspaceId, ctx.submissionId, e.id, timeout ? "timeout" : "error", ms, { message });
  }
}

/** Inline stage: offline enrichers only (email/MX, IP geo, UA, company domain + offline dataset). */
export async function runInlineEnrichment(ctx: EnrichmentContext, settings: FormSettings["enrichment"]): Promise<Enrichment> {
  const e = emptyEnrichment();
  const allowed: Record<string, boolean> = { email: settings.email, ipgeo: settings.geo, useragent: settings.userAgent, offline: settings.company };
  await Promise.all(LOCAL_ENRICHERS.filter((x) => allowed[x.id] !== false).map((x) => runEnricher(x, ctx, e, { log: x.id === "offline" || x.id === "ipgeo" })));
  return e;
}

// ---------- async provider enrichers ----------

export function apolloEnricher(): Enricher {
  return {
    id: "apollo", label: "Apollo.io", stage: "async", timeoutMs: PROVIDER_TIMEOUT_MS,
    isEnabled: (ctx) => resolveProvider(ctx.workspaceId, "apollo").enabled && !!(ctx.email || ctx.domain),
    async run(ctx, signal) {
      const cfg = resolveProvider(ctx.workspaceId, "apollo");
      const client = new ApolloClient(String(cfg.config.apiKey));
      const [p, o] = await Promise.all([
        ctx.email ? client.matchPerson({ email: ctx.email }, signal).catch(() => ({ person: null })) : Promise.resolve({ person: null }),
        ctx.domain ? client.enrichOrganization(ctx.domain, signal) : Promise.resolve({ organization: null }),
      ]);
      if (!p.person && !o.organization) return null;
      return { fields: apolloToFields(p.person, o.organization), raw: { person: p.person, organization: o.organization }, credits: (ctx.email ? 1 : 0) + (ctx.domain ? 1 : 0) };
    },
  };
}

export function valyuSearchEnricher(): Enricher {
  return {
    id: "valyu", label: "Valyu Search", stage: "async", timeoutMs: PROVIDER_TIMEOUT_MS,
    isEnabled: (ctx) => { const c = resolveProvider(ctx.workspaceId, "valyu"); return c.enabled && c.config.searchEnabled !== false && !!(ctx.domain || ctx.companyName); },
    async run(ctx, signal) {
      const cfg = resolveProvider(ctx.workspaceId, "valyu");
      const r = await researchCompanySearch(String(cfg.config.apiKey), { domain: ctx.domain, company: ctx.companyName }, signal);
      if (!r.snippets.length) return null;
      return { fields: { "research.summary": r.summary, "research.snippets": r.snippets, "research.sources": r.snippets.map((s) => s.url) }, raw: { results: r.snippets.length }, costUsd: r.costUsd };
    },
  };
}

export function aiProviderOrder(ws: string): AiProviderConfig[] {
  const pref = String(resolveProvider(ws, "ai").config.preferred || "openai") as "openai" | "openrouter";
  const order: ("openai" | "openrouter")[] = pref === "openrouter" ? ["openrouter", "openai"] : ["openai", "openrouter"];
  return order
    .map((id) => ({ id, r: resolveProvider(ws, id) }))
    .filter((x) => x.r.enabled)
    .map((x) => ({ provider: x.id, apiKey: String(x.r.config.apiKey), model: String(x.r.config.model || (x.id === "openai" ? "gpt-4o-mini" : "openai/gpt-4o-mini")), engine: (x.r.config.engine as "ai-sdk" | "openai-sdk") || "ai-sdk" }));
}

export function aiEnricher(current: () => Enrichment): Enricher {
  return {
    id: "ai", label: "AI (OpenAI / OpenRouter)", stage: "async", timeoutMs: Math.max(PROVIDER_TIMEOUT_MS, 20_000),
    isEnabled: (ctx) => aiProviderOrder(ctx.workspaceId).length > 0,
    async run(ctx, signal) {
      const icp = String(resolveProvider(ctx.workspaceId, "ai").config.icp || "");
      const { attribution: _a, providers: _p, ...known } = current();
      void _a; void _p;
      const prompt = buildPrompt({ data: ctx.data, enrichment: known, icp });
      const errors: string[] = [];
      for (const cfg of aiProviderOrder(ctx.workspaceId)) {
        try {
          const { object, tokens } = await runAiEnrichment(cfg, prompt, signal);
          return { fields: aiToFields(object), raw: { provider: cfg.provider, model: cfg.model, engine: cfg.engine, tokens, fallbackErrors: errors }, credits: tokens, costUsd: +(tokens * 0.0000006).toFixed(6) };
        } catch (err) {
          if (signal.aborted) throw err;
          errors.push(`${cfg.provider}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      throw new Error(errors.join(" | ") || "No AI provider available");
    },
  };
}

/** Heuristic fit score used when AI is unavailable (0–100). */
export function heuristicFit(e: Enrichment, data: Record<string, unknown>): number {
  let s = 20;
  const email = e.email as { valid?: boolean; freeProvider?: boolean; disposable?: boolean } | undefined;
  const company = e.company as { employees?: number; industry?: string; country?: string } | undefined;
  if (email?.valid) s += 10;
  if (email && !email.freeProvider && !email.disposable) s += 15;
  if (email?.disposable) s -= 30;
  const emp = Number(company?.employees ?? 0);
  if (emp >= 50 && emp <= 5000) s += 25; else if (emp > 5000) s += 15; else if (emp > 0) s += 5;
  if (company?.industry) s += 10;
  if (company?.country && ["US", "GB", "CA", "DE", "FR", "NL", "SE", "IE", "AU"].includes(String(company.country))) s += 10;
  const text = Object.values(data).filter((v) => typeof v === "string").join(" ");
  if (text.length > 80) s += 5;
  if (/demo|pricing|enterprise|team|buy|quote|trial/i.test(text)) s += 10;
  return Math.max(0, Math.min(100, Math.round(s)));
}

/** Async stage: Apollo → Valyu Search → AI (each with timeout + fallback), then Clay push and optional DeepResearch. */
export async function runProviderEnrichment(ctx: EnrichmentContext, enrichment: Enrichment, settings: FormSettings["enrichment"], formId: string) {
  if (settings.apollo) await runEnricher(apolloEnricher(), ctx, enrichment, { cacheKey: ctx.email || ctx.domain ? `${ctx.email ?? ""}|${ctx.domain ?? ""}` : null });
  if (settings.valyu) await runEnricher(valyuSearchEnricher(), ctx, enrichment, { cacheKey: ctx.domain || ctx.companyName });
  if (settings.ai) await runEnricher(aiEnricher(() => enrichment), ctx, enrichment);
  if (settings.clay) await pushToClay(ctx, enrichment, formId);
  if (settings.deepResearch && ctx.submissionId) await startDeepResearch(ctx, enrichment, settings.deepResearchMode);
  const ai = enrichment.ai as { icpScore?: number } | undefined;
  enrichment.fitScore = typeof ai?.icpScore === "number" ? ai.icpScore : heuristicFit(enrichment, ctx.data);
  enrichment.attribution["fitScore"] = typeof ai?.icpScore === "number" ? "ai" : "offline";
  return enrichment;
}

export async function pushToClay(ctx: EnrichmentContext, enrichment: Enrichment, formId: string) {
  const cfg = resolveProvider(ctx.workspaceId, "clay");
  if (!cfg.enabled || !ctx.submissionId) { enrichment.providers.clay = { status: "skipped", ms: 0 }; return; }
  const started = Date.now();
  try {
    await withTimeout(PROVIDER_TIMEOUT_MS, (signal) => sendToClay(String(cfg.config.webhookUrl), {
      submission_id: ctx.submissionId!, workspace_id: ctx.workspaceId, form_id: formId, email: ctx.email, domain: ctx.domain, company: ctx.companyName,
      fields: ctx.data, callback_url: `${publicUrl()}/api/integrations/clay/callback`, callback_header: "X-FormForge-Clay-Secret",
    }, signal));
    enrichment.providers.clay = { status: "pending", ms: Date.now() - started, message: "Sent to Clay; awaiting callback" };
    logEnrichment(ctx.workspaceId, ctx.submissionId, "clay", "success", Date.now() - started, { credits: 1, message: "sent" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    enrichment.providers.clay = { status: "error", ms: Date.now() - started, message };
    logEnrichment(ctx.workspaceId, ctx.submissionId, "clay", "error", Date.now() - started, { message });
  }
}

/** Merge an inbound Clay callback into a submission's enrichment. Returns the fields written. */
export function applyClayResult(enrichment: Enrichment, body: Record<string, unknown>) {
  const written = mergeFields(enrichment, "clay", clayToFields(body));
  enrichment.providers.clay = { status: "success", ms: 0, message: `Callback merged ${written.length} fields`, raw: body };
  return written;
}

// ---------- Valyu DeepResearch ----------

export async function startDeepResearch(ctx: EnrichmentContext, enrichment: Enrichment, mode: "fast" | "standard" | "heavy" | "max") {
  const cfg = resolveProvider(ctx.workspaceId, "valyu");
  if (!cfg.enabled || !(ctx.domain || ctx.companyName)) return null;
  const started = Date.now();
  try {
    const query = deepResearchQuery({ domain: ctx.domain, company: ctx.companyName });
    const base = publicUrl();
    const webhookUrl = base.startsWith("https://") ? `${base}/api/integrations/valyu/webhook` : undefined;
    const task = await createDeepResearch(String(cfg.config.apiKey), { query, mode, webhookUrl });
    const id = newId("rt");
    const ts = now();
    getDb()
      .prepare("INSERT INTO research_tasks (id, workspace_id, submission_id, provider, external_id, mode, query, secret_enc, status, created_at, updated_at) VALUES (?, ?, ?, 'valyu', ?, ?, ?, ?, 'running', ?, ?)")
      .run(id, ctx.workspaceId, ctx.submissionId ?? null, task.id, mode, query, task.webhookSecret ? encrypt(task.webhookSecret) : null, ts, ts);
    enrichment.research = { ...(enrichment.research ?? {}), deepResearch: { taskId: id, externalId: task.id, mode, status: "running", estimatedCredits: DEEP_RESEARCH_CREDITS[mode] } };
    logEnrichment(ctx.workspaceId, ctx.submissionId, "valyu", "pending", Date.now() - started, { credits: DEEP_RESEARCH_CREDITS[mode], message: `deepresearch ${mode} created` });
    const { enqueueJob } = await import("../jobs");
    enqueueJob("research.poll", { taskId: id }, 60_000);
    return id;
  } catch (err) {
    logEnrichment(ctx.workspaceId, ctx.submissionId, "valyu", "error", Date.now() - started, { message: `deepresearch: ${err instanceof Error ? err.message : err}` });
    return null;
  }
}

export interface ResearchTaskRow { id: string; workspace_id: string; submission_id: string | null; external_id: string; mode: string; query: string; secret_enc: string | null; status: string; result: string | null; error: string | null; created_at: string; updated_at: string }

export function getResearchTaskByExternal(externalId: string) {
  return getDb().prepare("SELECT * FROM research_tasks WHERE external_id = ?").get(externalId) as ResearchTaskRow | undefined;
}
export function researchSecret(t: ResearchTaskRow) { return t.secret_enc ? decrypt(t.secret_enc) : null; }

/** Complete a DeepResearch task (from webhook or polling); merges into submission + re-runs routing. */
export async function completeResearch(task: ResearchTaskRow, status: { status?: string; output?: unknown; error?: string; sources?: { url: string }[] }) {
  const db = getDb();
  if (task.status === "completed") return false;
  if (status.status === "failed" || status.status === "cancelled") {
    db.prepare("UPDATE research_tasks SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").run(status.error ?? status.status, now(), task.id);
    return false;
  }
  if (status.status !== "completed") return false;
  const parsed = parseDeepResearchOutput(status.output);
  db.prepare("UPDATE research_tasks SET status = 'completed', result = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(parsed ?? status.output ?? null), now(), task.id);
  if (task.submission_id && parsed) {
    if (!parsed.sources.length && status.sources) parsed.sources = status.sources.map((s) => s.url);
    const { mergeIntoSubmission } = await import("../processing");
    await mergeIntoSubmission(task.submission_id, "valyu", deepResearchToFields(parsed), { message: `DeepResearch (${task.mode}) completed`, research: { status: "completed", mode: task.mode } });
  }
  return true;
}

export async function pollResearch(taskId: string): Promise<"done" | "pending"> {
  const t = getDb().prepare("SELECT * FROM research_tasks WHERE id = ?").get(taskId) as ResearchTaskRow | undefined;
  if (!t || t.status !== "running") return "done";
  const cfg = resolveProvider(t.workspace_id, "valyu");
  if (!cfg.configured) return "done";
  const s = await getDeepResearchStatus(String(cfg.config.apiKey), t.external_id);
  if (s.status === "completed" || s.status === "failed" || s.status === "cancelled") { await completeResearch(t, s); return "done"; }
  if (Date.now() - new Date(t.created_at).getTime() > 2 * 3600_000) {
    getDb().prepare("UPDATE research_tasks SET status = 'failed', error = 'timed out', updated_at = ? WHERE id = ?").run(now(), t.id);
    return "done";
  }
  return "pending";
}

// ---------- connection tests ----------

export async function testIntegration(ws: string, id: IntegrationId): Promise<{ ok: boolean; message: string }> {
  const cfg = resolveProvider(ws, id);
  let result: { ok: boolean; message: string };
  try {
    if (id !== "ai" && !cfg.configured) throw new Error("No API key configured");
    switch (id) {
      case "apollo": {
        const h = await new ApolloClient(String(cfg.config.apiKey)).health(AbortSignal.timeout(10_000));
        if (h.is_logged_in === false) throw new Error("Apollo rejected the API key");
        result = { ok: true, message: "Connected to Apollo.io" };
        break;
      }
      case "clay": {
        await sendToClay(String(cfg.config.webhookUrl), { test: true, source: "formforge", sent_at: now() }, AbortSignal.timeout(10_000));
        result = { ok: true, message: "Test row accepted by Clay webhook" };
        break;
      }
      case "valyu": {
        const r = await researchCompanySearch(String(cfg.config.apiKey), { company: "Valyu", domain: "valyu.ai" }, AbortSignal.timeout(20_000));
        result = { ok: true, message: `Connected to Valyu · ${r.snippets.length} results` };
        break;
      }
      case "openai": result = { ok: true, message: await testOpenAI(String(cfg.config.apiKey)) }; break;
      case "openrouter": result = { ok: true, message: await testOpenRouter(String(cfg.config.apiKey)) }; break;
      case "ai": {
        const order = aiProviderOrder(ws);
        result = order.length ? { ok: true, message: `AI order: ${order.map((o) => `${o.provider} (${o.model})`).join(" → ")}` } : { ok: false, message: "Enable OpenAI or OpenRouter first" };
        break;
      }
    }
  } catch (err) {
    result = { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  recordTest(ws, id, result!.ok, result!.message);
  return result!;
}

export { saveProvider };
export type { ProviderId };
