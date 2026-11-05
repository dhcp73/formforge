# FormForge documentation

FormForge is a form backend for teams that care about every lead. Point any HTML form, `fetch` call or server at an endpoint. FormForge then **validates**, **filters spam**, **enriches**, **routes** and **delivers** every submission. You can manage all of it through the dashboard, a REST API or an MCP server for AI agents.

| Start here | |
|---|---|
| [Quickstart](/docs/quickstart) | Your first submission in 60 seconds |
| [Dynamic fields & schemas](/docs/dynamic-fields) | Accept anything, or validate and coerce |
| [Spam protection](/docs/spam) | Honeypot, rate limits, duplicate detection, spam score |
| [Enrichment](/docs/enrichment) | Email/MX, geo, device, company, Apollo, Clay, Valyu, AI |
| [Lead routing](/docs/routing) | Assign owners and tags based on enriched data |
| [Webhooks](/docs/webhooks) | HMAC-signed delivery with retries and logs |
| [Scheduling](/docs/scheduling) | Open/close windows, caps, digests, scheduled exports |
| [API keys](/docs/api-keys) | Scopes, rotation, revocation |
| [REST API](/docs/rest-api) · [Interactive reference](/docs/api) | Everything the dashboard can do |
| [MCP server](/docs/mcp) | Use FormForge from Cursor, Claude and other agents |
| [Status & health](/docs/status) | Health endpoints, monitors, incidents |
| [Integrations](/docs/integrations) | Apollo, Clay, Valyu, OpenAI, OpenRouter |

## Concepts

- **Workspace**: a tenant. It holds forms, keys, integrations, rules and members. Every query is scoped to it.
- **Form**: a public endpoint `POST /api/f/{formId}` plus its settings.
- **Submission**: the stored answers plus `enrichment` (per-field source attribution), `routing`, `spam` and `activity`.
- **Job runner**: a durable SQLite-backed queue that runs enrichment, webhooks, schedules, research polling and QA.
