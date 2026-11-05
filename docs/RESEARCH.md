# Research: Formcarry and the form-backend landscape

Researched November 2026. Sources: formcarry.com (home, pricing, docs), the public GitHub repos and LICENSE files of Formbricks, HeyForm, OpnForm and Typebot, and the vendor docs for Apollo, Clay, Valyu, OpenAI, OpenRouter and the Vercel AI SDK.

**Licensing rule we followed:** Formbricks, HeyForm and OpnForm are AGPL-3.0 (open-core, with proprietary `ee`/`Enterprise` directories). Typebot uses the Functional Source License, which prohibits competing hosted services. We read these repos only for **ideas and architecture**. FormForge contains **no code copied from AGPL, GPL or FSL projects**. Everything here is written from scratch or uses permissively licensed npm packages (MIT/Apache/ISC).

## 1. Formcarry: what it does

From formcarry.com/pricing (checked 5 Nov 2026):

| Plan | Price (yearly) | Limits |
| --- | --- | --- |
| Baby | $0 | 1 form, 50 submissions/mo, 1 member, MCP server |
| Starter | $5/mo ($6 monthly) | Unlimited forms, 500 submissions/mo, 3 members, 500 integration calls |
| Basic | $15/mo ($19 monthly) | 2,000 submissions/mo, 5 members, 2,000 integration calls |
| Growth | $49/mo (monthly) | (listed in their FAQ) |
| Premium | $80/mo ($99 monthly) | 20 members, 10,000 integration calls, 99.9% SLA |

Core product: a POST endpoint for static HTML forms. It also offers spam filtering, email notifications, file uploads, autoresponders, a REST API, webhooks and integrations, plus an **MCP server** so AI apps can manage forms.

### The biggest gaps (what FormForge fixes)

1. **A submission is just a blob.** Formcarry stores what was posted. It doesn't tell you *who* the lead is (company, size, title, intent) or *who should own it*. → FormForge adds an **enrichment waterfall** (offline → Apollo → Clay → Valyu → AI) with per-field attribution, a **fit score**, and a **routing engine** with round-robin that re-runs when late data arrives.
2. **No schema, no logic.** Forms are schema-less, which is great for setup but bad for data quality. → **Dynamic fields**: three schema modes (off, validate, strict), type detection and coercion, regex, length rules, renames, `select` options, and **branching logic** (`showIf`). Hidden fields are never required, and their values are dropped.
3. **No time control.** → **Scheduling**: open/close windows, submission caps, cron digests, scheduled webhook pushes and CSV exports on a durable job runner.
4. **Webhooks you can't debug.** → HMAC-signed webhooks (`t=…,v1=…`), five attempts with exponential backoff, full delivery logs with request and response, one-click redeliver.
5. **The API is an afterthought.** → **OpenAPI 3.1** with interactive docs at `/docs/api`, and **scoped, hashed API keys** with prefix display, last-used tracking, rotate and revoke. The MCP server enforces the same scopes per tool.
6. **No transparency on reliability.** → A built-in **monitor** probes every component every 60s. Incidents open and resolve automatically, uptime is tracked, and there's a public `/status` page plus a dashboard health page.
7. **Dated, low-density UI.** → An enterprise data-app UI (see `UI_RESEARCH.md`): dense tables, saved views, a record drawer, a command palette, dark mode, and a responsive layout.

## 2. Open-source projects studied (ideas only)

| Project | License | What we learned |
| --- | --- | --- |
| **Formbricks** (survey platform, Next.js + Prisma) | AGPL-3.0 + `ee` proprietary | Monorepo split between an embeddable JS SDK and the app; webhook "integration" model; per-environment API keys. We built our own simpler key model: hash only, prefix display, scopes. |
| **HeyForm** (conversational forms, Node + React) | AGPL-3.0 | Shared `answer-utils` package validating answers on both client and server → our `src/lib/ingest/logic.ts` is client-safe and used by both the hosted form and ingest. Conditional logic ("Smart Logic") → our `showIf`. |
| **OpnForm** (Laravel + Nuxt) | AGPL-3.0 + Enterprise | Field-level logic rules (show/require/disable when …), plus form-level closing date and submission limits → our `opensAt`/`closesAt`/`maxSubmissions`, with a 410 response and a custom closed message. |
| **Typebot** (chat builder) | FSL-1.1 (not OSI) | Block-based integrations (webhook, OpenAI) and result logs → our provider adapters with per-call cost and latency logs. |

## 3. Provider research (APIs we integrate)

| Provider | API used | Notes |
| --- | --- | --- |
| **Apollo.io** | `POST /api/v1/people/match` and `GET /api/v1/organizations/enrich?domain=` with the `X-Api-Key` header | Match by email; org enrichment by domain. Each call costs credits, so FormForge caches per workspace by email+domain for 7 days and logs credits per call. |
| **Clay** | Table "webhook source" (inbound) and an HTTP API column (outbound) | No official SDK. We POST the lead to the table webhook, and Clay calls back `/api/integrations/clay/callback`, authenticated with a per-workspace secret header or an HMAC. Clay data merges in and routing re-runs. |
| **Valyu** | `valyu-js`: `search()` and `deepresearch.create/status` | Search is fast and synchronous during enrichment. DeepResearch is an async job with `outputFormats: [JSON schema]`. A completion webhook is verified with the per-task `webhook_secret` (`sha256=HMAC(ts.body)`), with polling as a fallback. Credits: fast 25, standard 100, heavy 500, max 2500. |
| **OpenAI** | `openai` SDK (json_schema response_format) or the Vercel AI SDK `generateText` + `Output.object` via `@ai-sdk/openai` | Structured output (zod): summary, intent, ICP score, industry, seniority, spam likelihood. |
| **OpenRouter** | `@openrouter/ai-sdk-provider` with the Vercel AI SDK | Any model; used as the automatic fallback when OpenAI fails (or as the primary provider). |

Every provider is **optional**: with no key it auto-disables and the waterfall keeps going with offline data. Keys are stored AES-256-GCM encrypted at rest, and environment variables override per-workspace values.

## 4. Highlights / decisions

- **SQLite (WAL) + a DB-backed job queue** instead of Redis: one file, zero ops, survives restarts, and jobs are claimed atomically with `UPDATE … RETURNING`. That's good enough for a single node. See `ARCHITECTURE.md` for scaling notes.
- **Honeypot hits are accepted, then stored as spam.** Bots get a 200, so they learn nothing.
- **MCP over stdio and Streamable HTTP**, using the official `@modelcontextprotocol/sdk`. The 10 tools mirror the REST API, and scopes are enforced.
- **No third-party requests from the dashboard.** We dropped Google favicon logos (they leaked lead domains to Google) and use deterministic letter avatars instead.
