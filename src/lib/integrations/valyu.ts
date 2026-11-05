import { Valyu } from "valyu-js";
import { z } from "zod";
import { hmacHex, safeEqual } from "../secrets";

export const VALYU_BASE = process.env.VALYU_BASE_URL || "https://api.valyu.ai/v1";

export function valyuClient(apiKey: string) {
  return new Valyu(apiKey, VALYU_BASE, { timeout: 30_000, maxRateLimitRetries: 1 });
}

export interface CompanyResearch { summary: string | null; snippets: { title: string; url: string; snippet: string }[]; costUsd: number }

/** Fast synchronous company research via Valyu Search. */
export async function researchCompanySearch(apiKey: string, q: { domain?: string | null; company?: string | null }, signal?: AbortSignal): Promise<CompanyResearch> {
  const client = valyuClient(apiKey);
  const subject = [q.company, q.domain].filter(Boolean).join(" ");
  const query = `${subject} company overview headquarters number of employees industry recent news`;
  const res = await Promise.race([
    client.search(query, { searchType: "web", maxNumResults: 5, responseLength: "short" }),
    new Promise<never>((_, rej) => signal?.addEventListener("abort", () => rej(new Error("timeout")))),
  ]);
  if (!res.success) throw new Error(res.error || "Valyu search failed");
  const snippets = (res.results ?? []).slice(0, 5).map((r) => ({
    title: r.title, url: r.url,
    snippet: (r.description || (typeof r.content === "string" ? r.content : JSON.stringify(r.content))).slice(0, 400),
  }));
  return { summary: snippets[0]?.snippet ?? null, snippets, costUsd: res.total_deduction_dollars ?? 0 };
}

/** Structured output schema requested from DeepResearch. */
export const deepResearchSchema = z.object({
  company_name: z.string().nullable(),
  company_size: z.number().nullable().describe("Approximate number of employees"),
  hq_country: z.string().nullable().describe("ISO-3166 alpha-2 country code of HQ"),
  hq_city: z.string().nullable(),
  industry: z.string().nullable(),
  summary: z.string(),
  buying_signals: z.array(z.string()),
  sources: z.array(z.string()),
});
export type DeepResearchOutput = z.infer<typeof deepResearchSchema>;

export const deepResearchJsonSchema = () => {
  const js = z.toJSONSchema(deepResearchSchema) as Record<string, unknown>;
  delete js.$schema;
  return js;
};

export function deepResearchQuery(q: { domain?: string | null; company?: string | null; context?: string }) {
  return `Produce an account research brief on the company ${[q.company, q.domain && `(${q.domain})`].filter(Boolean).join(" ")}. ` +
    `Include employee count, headquarters, industry, a concise summary, current buying signals (hiring, funding, launches, leadership changes) and source URLs. ${q.context ?? ""}`.trim();
}

export async function createDeepResearch(apiKey: string, opts: { query: string; mode: "fast" | "standard" | "heavy" | "max"; webhookUrl?: string }) {
  const res = await valyuClient(apiKey).deepresearch.create({
    query: opts.query, mode: opts.mode, outputFormats: [deepResearchJsonSchema()], ...(opts.webhookUrl ? { webhookUrl: opts.webhookUrl } : {}),
  });
  if (!res.success || !res.deepresearch_id) throw new Error(res.error || "DeepResearch create failed");
  return { id: res.deepresearch_id, webhookSecret: res.webhook_secret ?? null, status: res.status ?? "queued" };
}

export async function getDeepResearchStatus(apiKey: string, id: string) {
  return valyuClient(apiKey).deepresearch.status(id);
}

/** Valyu webhooks: X-Webhook-Signature = "sha256=" + HMAC_SHA256(secret, `${timestamp}.${rawBody}`). */
export function verifyValyuSignature(rawBody: string, signature: string | null, timestamp: string | null, secret: string): boolean {
  if (!signature || !timestamp) return false;
  return safeEqual(signature, `sha256=${hmacHex(secret, `${timestamp}.${rawBody}`)}`);
}

export function parseDeepResearchOutput(output: unknown): DeepResearchOutput | null {
  let v = output;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  const r = deepResearchSchema.partial().safeParse(v);
  if (!r.success) return null;
  return { company_name: null, company_size: null, hq_country: null, hq_city: null, industry: null, summary: "", buying_signals: [], sources: [], ...r.data } as DeepResearchOutput;
}

export function deepResearchToFields(o: DeepResearchOutput): Record<string, unknown> {
  return {
    "company.name": o.company_name, "company.employees": o.company_size, "company.country": o.hq_country, "company.city": o.hq_city,
    "company.industry": o.industry, "research.summary": o.summary, "research.buyingSignals": o.buying_signals, "research.sources": o.sources,
  };
}
