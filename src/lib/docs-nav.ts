export const DOCS_NAV: { title: string; items: { slug: string; title: string }[] }[] = [
  { title: "Getting started", items: [{ slug: "", title: "Overview" }, { slug: "quickstart", title: "Quickstart" }] },
  { title: "Forms", items: [{ slug: "dynamic-fields", title: "Dynamic fields & schemas" }, { slug: "spam", title: "Spam protection" }, { slug: "scheduling", title: "Scheduling" }] },
  { title: "Leads", items: [{ slug: "enrichment", title: "Enrichment" }, { slug: "routing", title: "Lead routing" }] },
  { title: "Integrations", items: [{ slug: "integrations", title: "Overview" }, { slug: "integrations/apollo", title: "Apollo.io" }, { slug: "integrations/clay", title: "Clay" }, { slug: "integrations/valyu", title: "Valyu" }, { slug: "integrations/openai", title: "OpenAI" }, { slug: "integrations/openrouter", title: "OpenRouter" }, { slug: "integrations/ai", title: "AI settings" }, { slug: "integrations/google", title: "Google Calendar & Gmail" }, { slug: "integrations/microsoft", title: "Microsoft Outlook & Teams" }] },
  { title: "Developers", items: [{ slug: "api-keys", title: "API keys" }, { slug: "rest-api", title: "REST API" }, { slug: "api", title: "API reference ↗" }, { slug: "webhooks", title: "Webhooks" }, { slug: "mcp", title: "MCP server" }] },
  { title: "Operations", items: [{ slug: "status", title: "Status & health" }] },
];
export const ALL_DOCS = DOCS_NAV.flatMap((g) => g.items).filter((i) => i.slug !== "api");
