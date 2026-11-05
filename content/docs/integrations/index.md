# Integrations

FormForge uses your own keys (BYOK) for external enrichment and AI. Each provider is a **pluggable adapter** that:

- is configured per workspace in **Dashboard → Integrations**: paste a key, **test the connection**, then enable or disable it
- stores its key **encrypted at rest** with AES-256-GCM (the key comes from `FORMFORGE_SECRET`, or an auto-generated `data/.secret`)
- can be **overridden by environment variables**, which take precedence over workspace values
- **turns itself off** when no key is present. Status shows it as `disabled`, and enrichment skips it without errors.
- runs with a **timeout**, **caches** results per domain for 7 days, and **logs** latency, credits and cost

| Provider | What it adds | Env |
|---|---|---|
| [Apollo.io](/docs/integrations/apollo) | Person match (title, seniority, LinkedIn) and organization enrichment (size, industry, revenue, HQ) | `APOLLO_API_KEY` |
| [Clay](/docs/integrations/clay) | Push leads to a Clay table; signed callback merges results and re-runs routing | `CLAY_WEBHOOK_URL`, `CLAY_CALLBACK_SECRET` |
| [Valyu](/docs/integrations/valyu) | Search for quick company research; async DeepResearch with structured output | `VALYU_API_KEY` |
| [OpenAI](/docs/integrations/openai) | Summary, intent, ICP fit, industry via the Vercel AI SDK `generateText` + `Output.object` or the OpenAI SDK | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| [OpenRouter](/docs/integrations/openrouter) | Any model through the OpenRouter AI SDK provider; also the fallback for OpenAI | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |
| [AI settings](/docs/integrations/ai) | Preferred LLM provider and your ICP | none |

**Waterfall order:** Apollo → Clay → Valyu → offline dataset → IP geo → AI. See [Enrichment](/docs/enrichment) for how merging and attribution work.


## Calendar & email

- [Google Calendar & Gmail](/docs/integrations/google)
- [Microsoft Outlook & Teams](/docs/integrations/microsoft)
