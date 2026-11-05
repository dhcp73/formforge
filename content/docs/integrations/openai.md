# OpenAI

AI enrichment produces structured output that's validated with zod:

```ts
{ summary, intent: "sales_inquiry" | "demo_request" | "support" | "partnership" | "job_application" | "feedback" | "spam" | "other",
  icpScore: 0-100, icpReason, industry, companyDescription, seniority, spamLikelihood: 0-100 }
```

## Engines

- **Vercel AI SDK** (default): `generateText({ model: openai.chat(model), output: Output.object({ schema }) })` using `@ai-sdk/openai`
- **OpenAI SDK**: `chat.completions.create({ response_format: { type: "json_schema", … } })` using the official `openai` package, then parsed with the same zod schema

Choose the engine in **Integrations → OpenAI → Engine**. The default model is `gpt-4o-mini`. You can override it with `OPENAI_MODEL`.

## Behaviour

- Timeout: 20 seconds. If the call fails, the request falls back to [OpenRouter](/docs/integrations/openrouter) when that's configured.
- AI has priority 6 (the lowest), so it only fills fields that no data provider returned. `ai.icpScore` becomes the lead's `fitScore`.
- Token usage is logged, with an estimated cost.
- **Test connection** calls `GET /v1/models`.
