# FormForge

**Form backend for revenue teams.** Point any HTML form, fetch call or AI agent at an endpoint. Each lead comes back enriched (Apollo, Clay, Valyu, OpenAI/OpenRouter, plus a free offline waterfall), scored, routed to the right rep with round-robin, and delivered to signed webhooks on a schedule. It ships with a REST API, an MCP server, a status page and an enterprise-grade dashboard.

Built as a better [Formcarry](https://formcarry.com): see [docs/RESEARCH.md](docs/RESEARCH.md) for the research and the gaps it closes, [docs/UI_RESEARCH.md](docs/UI_RESEARCH.md) for the UI patterns, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works.

Stack: Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, SQLite (better-sqlite3, WAL), zod, Radix, TanStack Table, cmdk, recharts, MCP SDK, Vercel AI SDK, vitest, Playwright and axe.

## Quick start

```bash
npm install                 # also copies the Scalar bundle to public/vendor
npm run seed                # demo workspace: demo@formforge.dev / demo1234 (writes data/demo-api-key.txt)
npm run build
npm run start:all           # web :3100 + worker/scheduler/monitor (nohup; logs in data/logs)
open http://localhost:3100
npm run stop:all
```

For development, run `npm run dev` (the inline worker starts automatically) or `npm run worker` in a second terminal.

| URL | What |
| --- | --- |
| `/` `/features` `/pricing` `/changelog` `/about` | Marketing site |
| `/dashboard` | App (login `demo@formforge.dev` / `demo1234`) |
| `/docs` | Product and developer docs (Quickstart, fields and branching, spam, scheduling, enrichment, routing, integrations, API keys, REST, webhooks, MCP, status) |
| `/docs/api` | Interactive API reference (Scalar) for `/api/v1/openapi.json` |
| `/status` | Public status page (uptime, incidents); `/api/health`, `/api/health/ready`, `/api/v1/status` (API key) |
| `/f/{formId}` | Hosted form page (`?embed=1` for iframes) |

## Send a submission

```html
<form action="http://localhost:3100/api/f/FORM_ID" method="POST" enctype="multipart/form-data">
  <input name="email" type="email" required> <input name="company"> <textarea name="message"></textarea>
  <input type="text" name="_gotcha" style="display:none"> <!-- honeypot -->
  <button>Send</button>
</form>
```

```bash
curl -X POST http://localhost:3100/api/f/FORM_ID -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -d '{"email":"ada@stripe.com","message":"Demo for 40 seats?"}'
# → {"ok":true,"status":"success","id":"sub_…","spam":false}
```

## Features

- **Endpoints:** urlencoded, multipart (files up to 10 MB each, 25 MB total) and JSON, with CORS, a redirect or JSON response, and `_next` / `_subject` overrides.
- **Spam:** honeypot (accepted but stored as spam), per-IP rate limit, explainable 0–100 spam score (links, keywords, disposable email, bot UA, too-fast submit, duplicates), allowed domains, flag or reject.
- **Dynamic fields:** schema off / validate / strict; field types include text, email, number, select, radio, checkbox, multiselect, rating, **choice buttons**, hidden. **Branching** with operators (eq/neq/contains/gt/lt/in/empty/matches/domain_is/…) and actions (goto step, show/hide/skip, end, set_value, route). Choice buttons jump directly to the next step.
- **Enrichment waterfall:** offline (email syntax/MX/disposable/free/role, IP geo, UA, company dataset) → **Apollo** → **Valyu Search** → **AI** (OpenAI SDK or Vercel AI SDK; OpenRouter fallback) → **Clay** push with a signed callback → optional **Valyu DeepResearch** (async, structured output, webhook or polling, credit estimate shown). Includes per-field source attribution, timeouts, a per-workspace domain cache and cost/credit logs.
- **Routing:** rules on merged data (size, location, domain, title, AI intent and more; 14 operators, all/any, priority, stop-on-match).
  - **Weighted round-robin**, **account-owner stickiness** (same company domain) and **instant routing**: the owner is promised at submit time, and a **booking link** is returned (`booking_url`) and shown on the thank-you step.
  - Also tags, notify emails, rule webhooks and mark spam.
  - Routing re-runs when Clay or Valyu data arrives and keeps the promised owner.
- **Scheduling:** open/close windows, submission caps (410 responses), cron digests, scheduled webhook exports and CSV exports on a durable job queue.
- **Webhooks:** HMAC-SHA256 signatures, 5 attempts with backoff, delivery logs and redeliver.
- **Email:** SMTP (`SMTP_URL`), or an outbox log as fallback; notifications and autoresponder.
- **Exports:** CSV and JSON.
- **API keys:** `ff_live_…`, SHA-256 hashed, prefix shown, scopes, expiry, last used, rotate and revoke.
- **REST API:** `/api/v1` with an OpenAPI 3.1 spec.
- **MCP:** 10 tools over stdio and HTTP, with scopes enforced.
- **Integrations:** Settings → Integrations, with paste key / test / enable. Keys are encrypted at rest (AES-256-GCM), env vars override, and providers auto-disable without a key.
- **Calendar & email:** Connect Google (Calendar + Gmail via `googleapis`) or Microsoft (Outlook + Teams via MSAL/Graph) per rep. After routing, leads pick a real free/busy slot; FormForge creates the event with a Meet/Teams link and emails the confirmation. Round-robin skips connected reps with no availability. Falls back to external booking links + outbox when not connected.
- **Webhooks events:** `submission.created`, `submission.enriched`, `submission.routed`, plus aliases `enrichment.completed` and `routing.assigned`. HMAC-SHA256 signed.
- **Vercel / browser mode:** `STORAGE_MODE=browser` uses Node's built-in SQLite in memory (no `better-sqlite3`), seeds a demo workspace, persists a snapshot to the browser's `localStorage`, and drains jobs via `/api/cron/drain`.
- **Workspaces:** multi-tenant workspaces with members and a workspace switcher.
- **Dashboard:** collapsible sidebar, ⌘K palette, breadcrumbs, dense tables (column picker, resize and reorder, filter chips, saved views, bulk actions, pagination, skeletons), a record drawer (Answers · Enrichment · Routing · Activity · Raw), company/contact cards, fit score, analytics, and dark mode.
- **Monitoring:** worker probes 20 components every 60s; history, uptime %, auto-opening/resolving incidents, optional alerts (`ALERT_WEBHOOK_URL`, `ALERT_EMAIL`).
- **UI testing agent:** `npm run agent:ui` crawls every route at 4 viewports × 2 themes, with an optional AI visual review. It writes `reports/ui-agent/index.html`, can be scheduled with `FORMFORGE_QA_CRON`, appears at `/dashboard/qa`, and feeds the status monitor.

## MCP

```json
{ "mcpServers": { "formforge": { "url": "http://localhost:3100/api/mcp", "headers": { "Authorization": "Bearer ff_live_…" } } } }
```

stdio (Claude Desktop / Cursor):

```json
{ "mcpServers": { "formforge": { "command": "npm", "args": ["run", "--silent", "mcp", "--prefix", "/workspace/formforge"],
  "env": { "FORMFORGE_API_KEY": "ff_live_…", "FORMFORGE_URL": "http://localhost:3100" } } } }
```

`npm run mcp:client` exercises both transports.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` / `PUBLIC_URL` | `3100` / `http://localhost:3100` | Listen port and public base for links and callbacks (must be https for the Valyu webhook) |
| `FORMFORGE_SECRET` | dev value | Key for AES-GCM provider secrets; **set it in production** |
| `FORMFORGE_DATA_DIR` / `FORMFORGE_DB` | `./data` | Data dir (DB, uploads, exports, logs) |
| `SMTP_URL`, `MAIL_FROM` | outbox | Email transport |
| `APOLLO_API_KEY`, `CLAY_WEBHOOK_URL`, `CLAY_CALLBACK_SECRET`, `VALYU_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | — | Provider env overrides (otherwise per workspace in the UI) |
| `FORMFORGE_PROVIDER_TIMEOUT_MS` | `15000` | Per-provider timeout (AI uses at least 20s) |
| `FORMFORGE_MONITOR`, `FORMFORGE_MONITOR_INTERVAL_MS` | on, `60000` | Health monitor |
| `ALERT_WEBHOOK_URL`, `ALERT_EMAIL` | — | Incident alerts |
| `FORMFORGE_QA_CRON`, `FORMFORGE_QA_AI` | — | Schedule the UI agent; enable AI visual review |
| `STORAGE_MODE` | `sqlite` | `sqlite` (default file DB), `memory`, or `browser` (Vercel demo: in-memory + localStorage snapshot; no better-sqlite3) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Google Calendar + Gmail OAuth (or paste in Integrations) |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT` | — | Outlook + Teams OAuth (`common` tenant default) |
| `CRON_SECRET` | — | Bearer token for `/api/cron/drain` on Vercel |

## Scripts and tests

| Command | What |
| --- | --- |
| `npm test` | vitest: unit and integration (ingest, spam, schema, branching, enrichment merge, API keys, REST, webhooks/retries, jobs, schedules, routing + round-robin, MCP + scopes, monitor + incidents, providers mocked with msw) |
| `npm run test:e2e` | Playwright functional journeys (signup → form → test submission → drawer → API key → REST; hosted form branching; docs; status; palette) |
| `npm run test:ui` | UI audit: every route × 375/768/1280/1440 × light/dark. Checks console errors, failed requests, HTTP ≥ 400, overflow, overlap, `#` hrefs, dead links and axe serious/critical, plus keyboard checks (Tab focus, ⌘K, Esc). Screenshots go to `screenshots/qa/` |
| `npm run agent:ui` | Autonomous crawler report → `reports/ui-agent/index.html` |
| `npm run screenshots` | Curated product screenshots → `screenshots/*.png` |
| `npm run lint` / `npm run typecheck` / `npm run build` | Quality gates |
| `npm run check` | lint + typecheck + test |
| `npm run test:api-audit` | Hit every API route (auth / scope / invalid body) + verify webhook HMAC events → `reports/api-audit.md` |
| `npm run build:browser` | Production build with `STORAGE_MODE=browser` (Vercel-ready) |

## License

MIT © FormForge contributors. No code from AGPL/GPL/FSL projects was copied (see [docs/RESEARCH.md](docs/RESEARCH.md)).
