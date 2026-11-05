# FormForge architecture

```
                         ┌──────────────── Next.js 15 (App Router, Node runtime) :3100 ────────────────┐
  HTML / JS / curl ─POST─▶ /api/f/{id}  ingest: parse (urlencoded|multipart|JSON) → honeypot → rate limit │
                         │               → allowed domains → window/cap → schema + branching → spam score   │
                         │               → inline offline enrichment → store → enqueue submission.process   │
  REST clients ─Bearer──▶ /api/v1/*     apiRoute(): hashed key lookup → scope check → zod → svc.*          │
  AI agents ───────────▶ /api/mcp      MCP Streamable HTTP (stateless) → localBackend(ws, scopes)          │
  Clay / Valyu ─signed─▶ /api/integrations/{clay/callback, valyu/webhook} → mergeIntoSubmission → re-route │
  Browser ─────cookie──▶ /dashboard/* (RSC + server actions), /docs, /docs/api (Scalar), /status          │
                         └───────────────┬───────────────────────────────────────────────┬──────────────┘
                                         │ better-sqlite3 (WAL)                          │
                         ┌───────────────▼───────────────┐      ┌────────────────────────▼───────────────┐
                         │ data/formforge.db             │◀────▶│ worker (scripts/worker.ts, own process) │
                         │ users, workspaces, members,   │      │ 1s tick: heartbeat → due schedules →    │
                         │ forms, submissions, api_keys, │      │ drain jobs (submission.process,          │
                         │ webhooks, deliveries, jobs,   │      │ webhook.deliver, schedule.run,           │
                         │ schedules, exports, emails,   │      │ research.poll, routing.webhook, qa.run)  │
                         │ integrations (AES-GCM config),│      │ 60s: monitor probes → health_checks →    │
                         │ enrichment_logs/cache,        │      │ incidents (open after 2 downs, auto-     │
                         │ research_tasks, health_checks,│      │ resolve) → optional alert webhook/email  │
                         │ incidents, qa_runs, kv        │      └──────────────────────────────────────────┘
                         └───────────────────────────────┘
```

## Source layout

| Path | Responsibility |
| --- | --- |
| `src/lib/ingest/` | Body parsing, spam scoring, schema validation and coercion, branching logic (`logic.ts`, client-safe), rate limiting |
| `src/lib/enrich/` | Enricher contract, offline enrichers (email/MX, disposable, free provider, IP geo via geoip-lite, UA via bowser, company dataset), waterfall `runProviderEnrichment`, field merge with **priority-based attribution** (apollo > clay > valyu > offline > ipgeo > ai) |
| `src/lib/integrations/` | Provider adapters (Apollo, Clay, Valyu, OpenAI SDK / Vercel AI SDK, OpenRouter), registry (fields, env overrides) and the encrypted per-workspace store |
| `src/lib/routing.ts` | Rule engine (all/any, 14 operators, priority, stop-on-match, round-robin assignment, hit counts, step-by-step explanation) |
| `src/lib/processing.ts` | Async pipeline per submission: providers → fit score → routing → webhooks → notifications; `mergeIntoSubmission` for late data |
| `src/lib/webhooks.ts` | HMAC signing `X-FormForge-Signature: t=<unix>,v1=<hex(HMAC_SHA256(secret, t + "." + body))>`, delivery log, 5 attempts (0s, 30s, 2m, 10m, 1h) |
| `src/lib/jobs.ts`, `worker.ts` | SQLite job queue (atomic claim with `UPDATE … RETURNING`, retries, stale recovery), worker loop, scheduler, QA cron |
| `src/lib/schedules.ts` | Cron (cron-parser, per-timezone): digest email, webhook export, CSV export to `data/exports` |
| `src/lib/monitor.ts` | 20 probes (database, storage, ingest, REST, OpenAPI, MCP, queue, scheduler, webhooks, email, routing, offline enrichment, UI QA, 5 providers) with history, uptime, incidents and alerts |
| `src/lib/mcp/` | MCP server (10 tools), `localBackend` (in-process, scope-checked) and HTTP backend for stdio (`scripts/mcp-stdio.ts`) |
| `src/lib/apikeys.ts`, `api.ts`, `openapi.ts` | Keys (`ff_live_…`, SHA-256 hash, 14-char prefix, scopes, expiry, last used), REST wrapper and error shape, OpenAPI 3.1 document |
| `src/app/dashboard/` | Enterprise UI: shell (collapsible sidebar, workspace switcher, ⌘K palette, breadcrumbs), TanStack tables, record drawer, analytics (recharts) |
| `scripts/` | `seed.ts`, `worker.ts`, `mcp-stdio.ts`, `mcp-client.ts`, `ui-agent.ts`, `start-all.sh` / `stop-all.sh` |
| `tests/` (vitest), `e2e/` (Playwright) | Unit/integration with msw provider mocks; functional e2e; UI audit matrix |

## Key flows

**Submission:** the ingest step is synchronous and fast: offline enrichment only, typically under 30 ms. Its response returns immediately. Provider enrichment, routing, webhooks and email all run in the worker. Clay and Valyu DeepResearch complete later via signed callbacks (or polling), which merge fields according to source priority and **re-run routing**, so a lead can move to the enterprise queue once Clay or Valyu reveals it has 2,000 employees.

**Multi-tenancy:** every table carries `workspace_id`. Every query in `lib/` takes the workspace from the session or the API key, never from the request body. The enrichment cache is keyed per workspace, so one tenant's paid provider data never serves another. There's a test for cross-tenant 404s.

**Security:**
- Passwords: scrypt.
- Sessions: random tokens stored hashed, in httpOnly SameSite=Lax cookies.
- API keys: only the hash is stored.
- Provider secrets: AES-256-GCM, with the key derived from `FORMFORGE_SECRET`.
- Webhooks and callbacks: verified with constant-time comparison.
- File downloads: require a session or an API key with `submissions:read`.
- The dashboard makes no third-party requests.

**Scaling path:** SQLite + one worker suits a single node handling roughly 100s of submissions per second. To scale out, swap `db.ts` to Postgres (all SQL is in `lib/`) and the job table for a queue (for example Vercel Queues or SQS); the `registerJob` handler contract stays the same.


## Storage modes

| `STORAGE_MODE` | DB | Worker | Notes |
| --- | --- | --- | --- |
| `sqlite` (default) | better-sqlite3 file | long-lived `scripts/worker.ts` | Local / single-node |
| `memory` | `node:sqlite` `:memory:` | optional | Ephemeral; resets on restart |
| `browser` | `node:sqlite` `:memory:` | `/api/cron/drain` | Vercel demo: no native addon; demo seed; client `localStorage` snapshot via `/api/demo/*` |

## Calendar booking

After routing, `/api/v1/booking/slots` returns free/busy for the assigned owner (Google freeBusy or Graph getSchedule). `POST /api/v1/booking` creates the event (Meet/Teams) and emails via Gmail/Graph, with outbox fallback.
