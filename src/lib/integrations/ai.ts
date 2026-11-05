import { generateText, Output } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import OpenAI from "openai";
import { z } from "zod";

export const aiEnrichmentSchema = z.object({
  summary: z.string().describe("One or two sentence summary of who the lead is and what they want"),
  intent: z.enum(["sales_inquiry", "demo_request", "support", "partnership", "job_application", "feedback", "spam", "other"]),
  icpScore: z.number().int().min(0).max(100).describe("How well the lead matches the ideal customer profile"),
  icpReason: z.string(),
  industry: z.string().nullable(),
  companyDescription: z.string().nullable(),
  seniority: z.string().nullable(),
  spamLikelihood: z.number().min(0).max(1),
});
export type AiEnrichment = z.infer<typeof aiEnrichmentSchema>;

export interface AiProviderConfig { provider: "openai" | "openrouter"; apiKey: string; model: string; engine?: "ai-sdk" | "openai-sdk" }

export const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
export const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

export function buildPrompt(input: { data: Record<string, unknown>; enrichment: Record<string, unknown>; icp: string }) {
  return [
    "You are a B2B lead qualification assistant. Analyse this inbound form submission.",
    `Ideal customer profile: ${input.icp}`,
    `Form answers (JSON): ${JSON.stringify(input.data).slice(0, 4000)}`,
    `Known enrichment (JSON): ${JSON.stringify(input.enrichment).slice(0, 3000)}`,
    "Infer industry/company description from the email domain and answers when unknown. Return only the structured object.",
  ].join("\n");
}

/** Vercel AI SDK is the unified abstraction: OpenAI and OpenRouter both go through generateText + Output.object. */
export function languageModel(cfg: AiProviderConfig) {
  if (cfg.provider === "openrouter") return createOpenRouter({ apiKey: cfg.apiKey, baseURL: OPENROUTER_BASE }).chat(cfg.model);
  return createOpenAI({ apiKey: cfg.apiKey, baseURL: OPENAI_BASE }).chat(cfg.model);
}

export async function runAiEnrichment(cfg: AiProviderConfig, prompt: string, signal?: AbortSignal): Promise<{ object: AiEnrichment; tokens: number }> {
  if (cfg.provider === "openai" && cfg.engine === "openai-sdk") {
    const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: OPENAI_BASE, maxRetries: 0 });
    const schema = z.toJSONSchema(aiEnrichmentSchema) as Record<string, unknown>;
    delete schema.$schema;
    const res = await client.chat.completions.create(
      { model: cfg.model, messages: [{ role: "user", content: prompt }], response_format: { type: "json_schema", json_schema: { name: "lead_enrichment", schema, strict: false } } },
      { signal },
    );
    const content = res.choices[0]?.message?.content ?? "";
    return { object: aiEnrichmentSchema.parse(JSON.parse(content)), tokens: res.usage?.total_tokens ?? 0 };
  }
  const res = await generateText({ model: languageModel(cfg), output: Output.object({ schema: aiEnrichmentSchema, name: "lead_enrichment" }), prompt, abortSignal: signal, maxRetries: 0 });
  return { object: aiEnrichmentSchema.parse(res.output), tokens: res.usage?.totalTokens ?? 0 };
}

export async function testOpenAI(apiKey: string) {
  const client = new OpenAI({ apiKey, baseURL: OPENAI_BASE, maxRetries: 0, timeout: 10_000 });
  const page = await client.models.list();
  return `Connected · ${page.data.length} models available`;
}

export async function testOpenRouter(apiKey: string) {
  const res = await fetch(`${OPENROUTER_BASE}/key`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`OpenRouter responded ${res.status}`);
  const j = (await res.json()) as { data?: { label?: string } };
  return `Connected${j.data?.label ? ` · key "${j.data.label}"` : ""}`;
}

export function aiToFields(o: AiEnrichment): Record<string, unknown> {
  return {
    "ai.summary": o.summary, "ai.intent": o.intent, "ai.icpScore": o.icpScore, "ai.icpReason": o.icpReason, "ai.spamLikelihood": o.spamLikelihood,
    "company.industry": o.industry, "company.description": o.companyDescription, "person.seniority": o.seniority,
  };
}
