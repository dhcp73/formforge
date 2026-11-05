/** Static description of every third-party provider (drives Settings → Integrations UI, docs and status). */
export type IntegrationId = "apollo" | "clay" | "valyu" | "openai" | "openrouter" | "ai";

export interface IntegrationField {
  key: string;
  label: string;
  type: "secret" | "text" | "url" | "select" | "boolean" | "textarea";
  env?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  default?: string | boolean;
  help?: string;
  generated?: boolean;
  required?: boolean;
}

export interface IntegrationDef {
  id: IntegrationId;
  label: string;
  category: "Enrichment" | "Research" | "AI";
  description: string;
  docs: string;
  fields: IntegrationField[];
  /** field that must be present for the provider to count as configured */
  keyField?: string;
}

export const DEEP_RESEARCH_CREDITS: Record<string, number> = { fast: 25, standard: 100, heavy: 500, max: 2500 };

export const INTEGRATIONS: IntegrationDef[] = [
  {
    id: "apollo", label: "Apollo.io", category: "Enrichment", docs: "/docs/integrations/apollo", keyField: "apiKey",
    description: "Person match by email and organization enrichment by domain: title, seniority, employee count, industry, HQ, revenue, LinkedIn.",
    fields: [{ key: "apiKey", label: "API key", type: "secret", env: "APOLLO_API_KEY", placeholder: "Apollo master API key", required: true }],
  },
  {
    id: "clay", label: "Clay", category: "Enrichment", docs: "/docs/integrations/clay", keyField: "webhookUrl",
    description: "Send each lead to a Clay table webhook; Clay calls back to FormForge with enriched columns that merge into the submission.",
    fields: [
      { key: "webhookUrl", label: "Clay table webhook URL", type: "secret", env: "CLAY_WEBHOOK_URL", placeholder: "https://api.clay.com/v3/sources/webhook/…", required: true },
      { key: "callbackSecret", label: "Callback secret", type: "secret", env: "CLAY_CALLBACK_SECRET", generated: true, help: "Send as X-FormForge-Clay-Secret header from Clay's HTTP API action." },
      { key: "rerunRouting", label: "Re-run routing when Clay results arrive", type: "boolean", default: true },
    ],
  },
  {
    id: "valyu", label: "Valyu", category: "Research", docs: "/docs/integrations/valyu", keyField: "apiKey",
    description: "Fast Search for company research during enrichment, plus async DeepResearch for in-depth account briefs with structured output.",
    fields: [
      { key: "apiKey", label: "API key", type: "secret", env: "VALYU_API_KEY", required: true },
      { key: "searchEnabled", label: "Run Search during enrichment", type: "boolean", default: true },
      {
        key: "deepResearchMode", label: "Default DeepResearch mode", type: "select", default: "fast",
        options: [
          { value: "fast", label: "Fast · ~25 credits" }, { value: "standard", label: "Standard · ~100 credits" },
          { value: "heavy", label: "Heavy · ~500 credits" }, { value: "max", label: "Max · ~2500 credits" },
        ],
      },
    ],
  },
  {
    id: "openai", label: "OpenAI", category: "AI", docs: "/docs/integrations/openai", keyField: "apiKey",
    description: "Lead summary, intent, ICP fit score, industry inference and AI spam check with structured (zod) output.",
    fields: [
      { key: "apiKey", label: "API key", type: "secret", env: "OPENAI_API_KEY", placeholder: "sk-…", required: true },
      { key: "model", label: "Model", type: "text", env: "OPENAI_MODEL", default: "gpt-4o-mini" },
      {
        key: "engine", label: "Engine", type: "select", default: "ai-sdk",
        options: [{ value: "ai-sdk", label: "Vercel AI SDK (structured output)" }, { value: "openai-sdk", label: "OpenAI SDK (json_schema)" }],
      },
    ],
  },
  {
    id: "openrouter", label: "OpenRouter", category: "AI", docs: "/docs/integrations/openrouter", keyField: "apiKey",
    description: "Route AI enrichment to any model (Claude, Llama, Gemini, GPT…) through OpenRouter via the Vercel AI SDK provider.",
    fields: [
      { key: "apiKey", label: "API key", type: "secret", env: "OPENROUTER_API_KEY", placeholder: "sk-or-…", required: true },
      { key: "model", label: "Model", type: "text", env: "OPENROUTER_MODEL", default: "openai/gpt-4o-mini" },
    ],
  },
  {
    id: "ai", label: "AI enrichment settings", category: "AI", docs: "/docs/integrations/ai",
    description: "Which LLM provider runs first (the other is the fallback) and your ideal customer profile used for fit scoring.",
    fields: [
      { key: "preferred", label: "Preferred provider", type: "select", default: "openai", options: [{ value: "openai", label: "OpenAI" }, { value: "openrouter", label: "OpenRouter" }] },
      { key: "icp", label: "Ideal customer profile", type: "textarea", default: "B2B software companies with 50–5000 employees in the US, UK or EU; decision makers in engineering, product or growth." },
    ],
  },
];

export const integrationDef = (id: IntegrationId) => INTEGRATIONS.find((i) => i.id === id)!;
