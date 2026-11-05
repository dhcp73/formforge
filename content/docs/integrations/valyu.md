# Valyu

[Valyu](https://valyu.ai) adds web-grounded company research. FormForge uses the official `valyu-js` SDK.

## Search (fast, inline in the waterfall)

During async enrichment, FormForge runs a Valyu **Search** for the company domain or name. It adds a short `research.summary` and `research.sources`, which are attributed to `valyu`. You can turn this off with **Run Search during enrichment**.

## DeepResearch (async)

Enable **Valyu DeepResearch** on a form (**Form → Settings → Enrichment**) and pick a mode:

| Mode | Approx. credits per lead |
|---|---|
| fast (default) | 25 |
| standard | 100 |
| heavy | 500 |
| max | 2500 |

The dashboard shows the estimated cost when you choose a mode. FormForge creates a task with `deepresearch.create({ query, mode, outputFormats: [jsonSchema], webhookUrl })`, using this structured schema:

```json
{ "company_size": "…", "hq_country": "…", "industry": "…", "summary": "…", "buying_signals": ["…"], "sources": ["…"] }
```

The task's `webhook_secret` is stored **encrypted**. When Valyu calls `{{BASE}}/api/integrations/valyu/webhook`, FormForge verifies `X-Webhook-Signature` (`sha256=` + HMAC-SHA256 of `"{X-Webhook-Timestamp}.{rawBody}"`). It then parses the output, merges it as `research.*` and `company.*` fields with source `valyu`, and re-runs routing.

**Polling fallback:** Valyu can only send a webhook to a public `https` `PUBLIC_URL`. Without one, or if the webhook never arrives, the job runner polls `deepresearch.status(id)` every minute for up to 2 hours.

## API & MCP

```bash
# quick search
curl -X POST {{BASE}}/api/v1/research -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"domain":"stripe.com"}'
# deep research (async) – returns a task id
curl -X POST {{BASE}}/api/v1/research -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"domain":"stripe.com","mode":"fast"}'
curl {{BASE}}/api/v1/research/$TASK -H "Authorization: Bearer $KEY"
```

The MCP tool is `research_company` with `{ domain | company, mode?: "search" | "fast" | "standard" | "heavy" | "max", submission_id? }`.

## Setup

Paste your key into **Dashboard → Integrations → Valyu**, or set `VALYU_API_KEY`. **Test connection** runs a one-result search.
