# Enrichment

Enrichment runs in two stages so the form endpoint stays fast.

1. **Inline**, during the request. This stage works offline and needs no keys:
   - **Email**: syntax, MX lookup, disposable domains, free providers, role accounts
   - **IP geolocation**: country, region, city and timezone (offline GeoLite data)
   - **Device**: browser, OS, device type and bot detection
   - **Company**: guessed from the email domain using a built-in dataset of companies and domain heuristics
2. **Async**, on the job runner, a few hundred milliseconds later. It runs the external waterfall:

```
Apollo → Clay (async callback) → Valyu Search → offline → IP geo → AI (OpenAI / OpenRouter)
                                   ↘ Valyu DeepResearch (async webhook / poll)
```

Each provider gets its own timeout. Results are cached per domain for 7 days, and every call is logged with its latency, credits and cost (see **Dashboard → Enrichment**).

## Merging & attribution

Every enriched field records which provider supplied it in `enrichment.attribution`:

```json
{
  "company": { "name": "Stripe", "employees": 8000, "industry": "Financial Services" },
  "attribution": { "company.name": "apollo", "company.employees": "apollo", "geo.country": "ipgeo", "ai.summary": "ai" },
  "providers": { "apollo": { "status": "success", "ms": 412 }, "valyu": { "status": "skipped", "message": "not configured" } }
}
```

When several providers return the same field, the one with the higher priority wins. The order is `apollo` > `clay` > `valyu` > `offline` > `ipgeo` > `ai`. Data that arrives later, from a Clay callback or Valyu DeepResearch, is merged with the same rules, and [routing](/docs/routing) re-runs on the result.

## Fit score

Each lead gets a `fitScore` from 0 to 100. If AI is configured, the score comes from your ideal customer profile (ICP). Otherwise a heuristic uses company size, seniority, email quality and spam signals.

## Missing keys

A provider without a key is **skipped** and marked `disabled` in status. The pipeline never fails because of a missing key, a timeout or a provider error. It falls through to the next provider.

## Re-enrich

- Dashboard: the **Re-enrich** button in the record drawer
- REST: `POST /api/v1/submissions/{id}/enrich`
- MCP: `enrich_submission`
