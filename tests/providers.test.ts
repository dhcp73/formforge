import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse, delay } from "msw";
import { workspace, form, submit, call } from "./helpers";
import { saveProvider, resolveProvider, listIntegrationsView } from "@/lib/integrations/store";
import { testIntegration, pollResearch } from "@/lib/enrich/pipeline";
import { registerHandlers } from "@/lib/worker";
import { drainJobs } from "@/lib/jobs";
import { getSubmission } from "@/lib/submissions";
import { createRule } from "@/lib/routing";
import { getDb } from "@/lib/db";
import { hmacHex } from "@/lib/secrets";
import { svc } from "@/lib/service";
import * as ClayCallback from "@/app/api/integrations/clay/callback/route";
import * as ValyuWebhook from "@/app/api/integrations/valyu/webhook/route";

process.env.PUBLIC_URL = "https://formforge.test"; // https → Valyu webhook_url is sent

const APOLLO = "https://apollo.test/api/v1";
const VALYU = "https://valyu.test/v1";
const calls: { name: string; body?: unknown; headers?: Headers }[] = [];
const seen = (name: string) => calls.filter((c) => c.name === name);

const apolloOk = [
  http.post(`${APOLLO}/people/match`, async ({ request }) => { calls.push({ name: "apollo.person", body: await request.json(), headers: request.headers }); return HttpResponse.json({ person: { name: "Grace Hopper", title: "VP Engineering", seniority: "vp", linkedin_url: "https://linkedin.com/in/grace", organization: null } }); }),
  http.get(`${APOLLO}/organizations/enrich`, ({ request }) => { calls.push({ name: "apollo.org", headers: request.headers }); return HttpResponse.json({ organization: { name: "Navy Systems", primary_domain: new URL(request.url).searchParams.get("domain"), estimated_num_employees: 1200, industry: "Defense & Space", country: "United States", city: "Arlington", annual_revenue: 50000000, linkedin_url: "https://linkedin.com/company/navy" } }); }),
  http.get(`${APOLLO}/auth/health`, () => HttpResponse.json({ healthy: true, is_logged_in: true })),
];
const completion = (obj: unknown) => HttpResponse.json({ id: "cmpl_1", object: "chat.completion", created: 1, model: "gpt-4o-mini", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(obj) }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } });
const aiObject = { summary: "VP Eng at a large defense company asking for a demo.", intent: "demo_request", icpScore: 91, icpReason: "Large B2B org", industry: "Defense", companyDescription: "Builds systems", seniority: "VP", spamLikelihood: 0.02 };

const server = setupServer(
  ...apolloOk,
  http.post("https://openai.test/v1/chat/completions", async ({ request }) => { calls.push({ name: "openai", body: await request.json(), headers: request.headers }); return completion(aiObject); }),
  http.post("https://openrouter.test/api/v1/chat/completions", async ({ request }) => { calls.push({ name: "openrouter", body: await request.json(), headers: request.headers }); return completion({ ...aiObject, icpScore: 77 }); }),
  http.post("https://clay.test/hook", async ({ request }) => { calls.push({ name: "clay", body: await request.json() }); return HttpResponse.json({ ok: true }); }),
  http.post(`${VALYU}/search`, async ({ request }) => { calls.push({ name: "valyu.search", body: await request.json(), headers: request.headers }); return HttpResponse.json({ success: true, results: [{ title: "Navy Systems — About", url: "https://navy.example/about", content: "Navy Systems is a defense contractor with 1,200 employees.", description: "Defense contractor HQ in Arlington", source: "web" }], total_deduction_dollars: 0.0015 }); }),
  http.post(`${VALYU}/deepresearch/tasks`, async ({ request }) => { calls.push({ name: "valyu.create", body: await request.json(), headers: request.headers }); return HttpResponse.json({ deepresearch_id: `dr_${calls.length}`, status: "queued", webhook_secret: "whsec_valyu_test" }); }),
  http.get(`${VALYU}/deepresearch/tasks/:id/status`, ({ params }) => { calls.push({ name: "valyu.status" }); return HttpResponse.json({ deepresearch_id: params.id, status: "completed", output: { company_name: "Navy Systems Inc", company_size: 1300, hq_country: "US", hq_city: "Arlington", industry: "Defense", summary: "Defense contractor expanding into cloud.", buying_signals: ["Hiring 40 engineers"], sources: [] }, sources: [{ url: "https://navy.example/news" }] }); }),
);
beforeAll(() => { server.listen(); registerHandlers(); });
afterEach(() => { server.resetHandlers(); calls.length = 0; });
afterAll(() => server.close());

const drainAll = async () => { for (let i = 0; i < 10; i++) if (!(await drainJobs(50))) break; };
let n = 0;
async function lead(ws: string, settings: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
  const f = form(ws, settings);
  n++;
  const r = await submit(f.id, { name: "Grace Hopper", email: `grace${n}@navy${n}.example`, message: "We'd like a demo for our team", ...data }, { ip: "81.2.69.142" });
  await drainAll();
  return getSubmission(ws, r.json.id as string)!;
}
type P = Record<string, { status: string; message?: string; raw?: Record<string, unknown> }>;

describe("provider store", () => {
  it("encrypts keys at rest, masks in views, keeps secrets on masked re-save", () => {
    const { ws } = workspace("Store");
    saveProvider(ws, "apollo", { config: { apiKey: "apollo-secret-key-123456" } });
    const row = getDb().prepare("SELECT config_enc FROM integrations WHERE workspace_id = ? AND provider = 'apollo'").get(ws) as { config_enc: string };
    expect(row.config_enc).not.toContain("apollo-secret");
    const view = listIntegrationsView(ws).find((i) => i.id === "apollo")!;
    expect(String(view.values.apiKey)).not.toContain("secret-key");
    saveProvider(ws, "apollo", { config: { apiKey: String(view.values.apiKey) } });
    expect(resolveProvider(ws, "apollo").config.apiKey).toBe("apollo-secret-key-123456");
    saveProvider(ws, "apollo", { enabled: false });
    expect(resolveProvider(ws, "apollo").enabled).toBe(false);
  });
  it("auto-disables without a key and honours env overrides", () => {
    const { ws } = workspace("Env");
    expect(resolveProvider(ws, "valyu")).toMatchObject({ enabled: false, configured: false, source: null });
    process.env.VALYU_API_KEY = "env-valyu";
    try { expect(resolveProvider(ws, "valyu")).toMatchObject({ enabled: true, source: "env" }); } finally { delete process.env.VALYU_API_KEY; }
    saveProvider(ws, "clay", { config: { webhookUrl: "https://clay.test/hook" } });
    expect(String(resolveProvider(ws, "clay").config.callbackSecret)).toMatch(/^ffcs_/);
  });
});

describe("no keys configured", () => {
  it("skips every paid provider and still completes offline enrichment", async () => {
    const { ws } = workspace("Keyless");
    const s = await lead(ws, { enrichment: { deepResearch: true } });
    const p = s.enrichment.providers as P;
    for (const id of ["apollo", "valyu", "ai", "clay"]) expect(p[id].status).toBe("skipped");
    expect(calls).toHaveLength(0);
    expect(s.enrichmentStatus).toBe("complete");
    expect(typeof s.fitScore).toBe("number");
    expect(getDb().prepare("SELECT COUNT(*) c FROM research_tasks WHERE workspace_id = ?").get(ws)).toEqual({ c: 0 });
    expect((await testIntegration(ws, "apollo")).ok).toBe(false);
  });
});

describe("Apollo", () => {
  it("success: merges person + org with attribution, credits logged, domain cache", async () => {
    const { ws } = workspace("Apollo");
    saveProvider(ws, "apollo", { config: { apiKey: "ap_test" } });
    const s = await lead(ws);
    expect(seen("apollo.person")[0].headers!.get("x-api-key")).toBe("ap_test");
    expect(s.enrichment.company).toMatchObject({ name: "Navy Systems", employees: 1200, industry: "Defense & Space" });
    expect(s.enrichment.person).toMatchObject({ title: "VP Engineering" });
    expect(s.enrichment.attribution).toMatchObject({ "company.employees": "apollo", "person.title": "apollo" });
    const log = getDb().prepare("SELECT status, credits FROM enrichment_logs WHERE submission_id = ? AND provider = 'apollo'").get(s.id);
    expect(log).toEqual({ status: "success", credits: 2 });
    // same email+domain again → cache hit, no new HTTP call
    calls.length = 0;
    const f = form(ws);
    const r = await submit(f.id, { email: (s.data.email as string) }, { ip: "81.2.69.142" });
    await drainAll();
    expect(seen("apollo.org")).toHaveLength(0);
    expect((getSubmission(ws, r.json.id as string)!.enrichment.providers as P).apollo.status).toBe("cache_hit");
    expect((await testIntegration(ws, "apollo")).ok).toBe(true);
  });
  it("timeout: falls back to offline data", async () => {
    const { ws } = workspace("ApolloSlow");
    saveProvider(ws, "apollo", { config: { apiKey: "ap_test" } });
    server.use(http.get(`${APOLLO}/organizations/enrich`, async () => { await delay(1500); return HttpResponse.json({ organization: null }); }));
    const s = await lead(ws, {}, { email: "pat@monzo.com" });
    expect((s.enrichment.providers as P).apollo.status).toBe("timeout");
    expect(s.enrichment.company).toMatchObject({ name: "Monzo" });
    expect((s.enrichment.attribution as Record<string, string>)["company.name"]).toBe("offline");
    expect(s.enrichmentStatus).toBe("complete");
  });
  it("error: 401 is recorded and the waterfall continues", async () => {
    const { ws } = workspace("ApolloErr");
    saveProvider(ws, "apollo", { config: { apiKey: "bad" } });
    saveProvider(ws, "openai", { config: { apiKey: "sk-test" } });
    server.use(http.get(`${APOLLO}/organizations/enrich`, () => HttpResponse.json({ error: "Invalid access credentials." }, { status: 401 })));
    const s = await lead(ws);
    const p = s.enrichment.providers as P;
    expect(p.apollo.status).toBe("error");
    expect(p.apollo.message).toMatch(/Apollo 401/);
    expect(p.ai.status).toBe("success");
  });
});

describe("AI (Vercel AI SDK + OpenAI SDK + OpenRouter)", () => {
  it("OpenAI via AI SDK generateObject → structured fields + fit score", async () => {
    const { ws } = workspace("OpenAI");
    saveProvider(ws, "openai", { config: { apiKey: "sk-test" } });
    const s = await lead(ws);
    const req = seen("openai")[0];
    expect(req.headers!.get("authorization")).toBe("Bearer sk-test");
    expect(JSON.stringify(req.body)).toContain("icpScore");
    expect(s.enrichment.ai).toMatchObject({ intent: "demo_request", icpScore: 91 });
    expect(s.fitScore).toBe(91);
    expect(s.enrichment.attribution).toMatchObject({ "ai.summary": "ai", fitScore: "ai" });
  });
  it("OpenAI SDK engine (json_schema response_format)", async () => {
    const { ws } = workspace("OpenAISDK");
    saveProvider(ws, "openai", { config: { apiKey: "sk-test", engine: "openai-sdk" } });
    const s = await lead(ws);
    expect((seen("openai")[0].body as { response_format: { type: string } }).response_format.type).toBe("json_schema");
    expect((s.enrichment.ai as { icpScore: number }).icpScore).toBe(91);
  });
  it("falls back OpenAI → OpenRouter on error", async () => {
    const { ws } = workspace("Fallback");
    saveProvider(ws, "openai", { config: { apiKey: "sk-test" } });
    saveProvider(ws, "openrouter", { config: { apiKey: "sk-or-test", model: "anthropic/claude-3.5-haiku" } });
    server.use(http.post("https://openai.test/v1/chat/completions", () => HttpResponse.json({ error: { message: "quota" } }, { status: 429 })));
    const s = await lead(ws);
    const p = s.enrichment.providers as P;
    expect(p.ai.status).toBe("success");
    expect(p.ai.raw).toMatchObject({ provider: "openrouter", model: "anthropic/claude-3.5-haiku" });
    expect((p.ai.raw!.fallbackErrors as string[])[0]).toMatch(/^openai:/);
    expect(s.fitScore).toBe(77);
    expect((seen("openrouter")[0].body as { model: string }).model).toBe("anthropic/claude-3.5-haiku");
  });
  it("both fail → error recorded, heuristic fit used", async () => {
    const { ws } = workspace("AIDown");
    saveProvider(ws, "openai", { config: { apiKey: "sk-test" } });
    server.use(http.post("https://openai.test/v1/chat/completions", () => new HttpResponse("boom", { status: 500 })));
    const s = await lead(ws);
    expect((s.enrichment.providers as P).ai.status).toBe("error");
    expect((s.enrichment.attribution as Record<string, string>).fitScore).toBe("offline");
    expect(typeof s.fitScore).toBe("number");
  });
});

describe("Clay", () => {
  it("pushes the lead, accepts a signed callback, merges and re-runs routing", async () => {
    const { ws } = workspace("Clay");
    const cfg = saveProvider(ws, "clay", { config: { webhookUrl: "https://clay.test/hook" } });
    createRule(ws, { name: "Enterprise", conditions: [{ field: "company.employees", op: "gte", value: 500 }], actions: { assignTo: ["ent@acme.example"], tags: ["enterprise"] } });
    const s = await lead(ws, {}, { email: "lee@unknownco.example" });
    expect((s.enrichment.providers as P).clay.status).toBe("pending");
    expect(s.owner).toBeNull();
    const out = seen("clay")[0].body as Record<string, unknown>;
    expect(out).toMatchObject({ submission_id: s.id, email: "lee@unknownco.example", domain: "unknownco.example", callback_url: "https://formforge.test/api/integrations/clay/callback", callback_header: "X-FormForge-Clay-Secret" });

    const body = { submission_id: s.id, "Company Name": "UnknownCo Ltd", employee_count: "1,450", Industry: "Logistics", job_title: "Head of Ops" };
    const bad = await call(ClayCallback.POST, "/api/integrations/clay/callback", { method: "POST", body: JSON.stringify(body), headers: { "x-formforge-clay-secret": "wrong" } });
    expect(bad.status).toBe(401);
    const ok = await call(ClayCallback.POST, "/api/integrations/clay/callback", { method: "POST", body: JSON.stringify(body), headers: { "x-formforge-clay-secret": String(cfg.config.callbackSecret) } });
    expect(ok.status).toBe(200);
    const after = getSubmission(ws, s.id)!;
    expect(after.enrichment.company).toMatchObject({ name: "UnknownCo Ltd", employees: 1450, industry: "Logistics" });
    expect(after.enrichment.attribution).toMatchObject({ "company.employees": "clay" });
    expect((after.enrichment.providers as P).clay.status).toBe("success");
    expect(after.owner).toBe("ent@acme.example");
    expect(after.tags).toContain("enterprise");
  });
  it("HMAC signature auth also works; unknown submission → 404", async () => {
    const { ws } = workspace("ClayHmac");
    const cfg = saveProvider(ws, "clay", { config: { webhookUrl: "https://clay.test/hook" } });
    const s = await lead(ws);
    const raw = JSON.stringify({ submission_id: s.id, industry: "Aerospace" });
    const r = await call(ClayCallback.POST, "/api/integrations/clay/callback", { method: "POST", body: raw, headers: { "x-formforge-signature": `sha256=${hmacHex(String(cfg.config.callbackSecret), raw)}` } });
    expect(r.status).toBe(200);
    expect((await call(ClayCallback.POST, "/api/integrations/clay/callback", { method: "POST", body: JSON.stringify({ submission_id: "sub_nope" }) })).status).toBe(404);
  });
  it("Clay endpoint failure is recorded without breaking processing", async () => {
    const { ws } = workspace("ClayDown");
    saveProvider(ws, "clay", { config: { webhookUrl: "https://clay.test/hook" } });
    server.use(http.post("https://clay.test/hook", () => new HttpResponse("", { status: 502 })));
    const s = await lead(ws);
    expect((s.enrichment.providers as P).clay).toMatchObject({ status: "error", message: "Clay webhook responded 502" });
    expect(s.enrichmentStatus).toBe("complete");
  });
});

describe("Valyu", () => {
  it("Search enriches research fields", async () => {
    const { ws } = workspace("ValyuSearch");
    saveProvider(ws, "valyu", { config: { apiKey: "val_test" } });
    const s = await lead(ws);
    expect(seen("valyu.search")[0].headers!.get("x-api-key")).toBe("val_test");
    expect((s.enrichment.providers as P).valyu.status).toBe("success");
    expect(s.enrichment.research).toMatchObject({ sources: ["https://navy.example/about"] });
    expect((s.enrichment.attribution as Record<string, string>)["research.summary"]).toBe("valyu");
  });
  it("DeepResearch: create → signed webhook → merge + routing", async () => {
    const { ws } = workspace("ValyuDR");
    saveProvider(ws, "valyu", { config: { apiKey: "val_test", searchEnabled: false } });
    createRule(ws, { name: "Big", conditions: [{ field: "company.employees", op: "gte", value: 1000 }], actions: { assignTo: ["big@acme.example"] } });
    const s = await lead(ws, { enrichment: { deepResearch: true, deepResearchMode: "standard" } }, { email: "ana@navyco.example" });
    const create = seen("valyu.create")[0].body as Record<string, unknown>;
    expect(create).toMatchObject({ mode: "standard", webhook_url: "https://formforge.test/api/integrations/valyu/webhook" });
    expect(JSON.stringify(create.output_formats)).toContain("buying_signals");
    const task = getDb().prepare("SELECT * FROM research_tasks WHERE submission_id = ?").get(s.id) as { external_id: string; status: string; secret_enc: string };
    expect(task.status).toBe("running");
    expect(task.secret_enc).not.toContain("whsec");
    expect((s.enrichment.research as { deepResearch: { estimatedCredits: number } }).deepResearch.estimatedCredits).toBe(100);

    const payload = JSON.stringify({ deepresearch_id: task.external_id, status: "completed", output: { company_name: "NavyCo", company_size: 2400, hq_country: "GB", hq_city: "London", industry: "Shipping", summary: "Global shipping firm.", buying_signals: ["New CTO"], sources: ["https://navyco.example"] } });
    const ts = String(Math.floor(Date.now() / 1000));
    const bad = await call(ValyuWebhook.POST, "/api/integrations/valyu/webhook", { method: "POST", body: payload, headers: { "x-webhook-signature": "sha256=deadbeef", "x-webhook-timestamp": ts } });
    expect(bad.status).toBe(401);
    const ok = await call(ValyuWebhook.POST, "/api/integrations/valyu/webhook", { method: "POST", body: payload, headers: { "x-webhook-signature": `sha256=${hmacHex("whsec_valyu_test", `${ts}.${payload}`)}`, "x-webhook-timestamp": ts } });
    expect(ok.json).toEqual({ ok: true, merged: true });
    const after = getSubmission(ws, s.id)!;
    expect(after.enrichment.company).toMatchObject({ employees: 2400, industry: "Shipping" });
    expect(after.enrichment.research).toMatchObject({ summary: "Global shipping firm.", buyingSignals: ["New CTO"] });
    expect((after.enrichment.attribution as Record<string, string>)["research.buyingSignals"]).toBe("valyu");
    expect(after.owner).toBe("big@acme.example");
    // idempotent
    const again = await call(ValyuWebhook.POST, "/api/integrations/valyu/webhook", { method: "POST", body: payload, headers: { "x-webhook-signature": `sha256=${hmacHex("whsec_valyu_test", `${ts}.${payload}`)}`, "x-webhook-timestamp": ts } });
    expect(again.json.merged).toBe(false);
  });
  it("DeepResearch polling fallback completes the task", async () => {
    const { ws } = workspace("ValyuPoll");
    saveProvider(ws, "valyu", { config: { apiKey: "val_test", searchEnabled: false } });
    const s = await lead(ws, { enrichment: { deepResearch: true } });
    const task = getDb().prepare("SELECT id FROM research_tasks WHERE submission_id = ?").get(s.id) as { id: string };
    expect(await pollResearch(task.id)).toBe("done");
    const after = getSubmission(ws, s.id)!;
    expect(after.enrichment.company).toMatchObject({ name: expect.any(String), employees: 1300 });
    expect(after.enrichment.research).toMatchObject({ sources: ["https://navy.example/news"] });
  });
  it("failure fallback: search 500 and create 500 leave the submission intact", async () => {
    const { ws } = workspace("ValyuDown");
    saveProvider(ws, "valyu", { config: { apiKey: "val_test" } });
    server.use(
      http.post(`${VALYU}/search`, () => HttpResponse.json({ success: false, error: "Internal" }, { status: 500 })),
      http.post(`${VALYU}/deepresearch/tasks`, () => HttpResponse.json({ success: false, error: "Insufficient credits" }, { status: 402 })),
    );
    const s = await lead(ws, { enrichment: { deepResearch: true } }, { email: "z@monzo.com" });
    expect((s.enrichment.providers as P).valyu.status).toBe("error");
    expect(s.enrichment.company).toMatchObject({ name: "Monzo" });
    expect(getDb().prepare("SELECT COUNT(*) c FROM research_tasks WHERE submission_id = ?").get(s.id)).toEqual({ c: 0 });
    const log = getDb().prepare("SELECT message FROM enrichment_logs WHERE submission_id = ? AND provider = 'valyu' AND status = 'error' AND message LIKE 'deepresearch%'").get(s.id) as { message: string };
    expect(log.message).toMatch(/deepresearch/);
  });
  it("research_company service: search, deep research and missing key", async () => {
    const { ws } = workspace("ValyuSvc");
    await expect(svc.researchCompany(ws, { domain: "navy.example" })).rejects.toMatchObject({ status: 409, code: "provider_disabled" });
    saveProvider(ws, "valyu", { config: { apiKey: "val_test" } });
    const r = await svc.researchCompany(ws, { domain: "navy.example" });
    expect(r).toMatchObject({ mode: "search", status: "completed" });
    const d = await svc.researchCompany(ws, { company: "Navy", mode: "heavy" }) as Record<string, unknown>;
    expect(JSON.stringify(d)).toContain("500");
  });
});
