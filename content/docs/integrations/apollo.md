# Apollo.io

FormForge calls two Apollo endpoints with the header `X-Api-Key`:

- `POST https://api.apollo.io/api/v1/people/match`, using the email, name and domain from the submission. It adds `person.name`, `person.title`, `person.seniority`, `person.linkedin` and `person.departments`. The organization embedded in the response is also used.
- `GET https://api.apollo.io/api/v1/organizations/enrich?domain=…`, which adds `company.name`, `company.employees`, `company.industry`, `company.revenue`, `company.country`, `company.city`, `company.linkedin`, `company.description` and `company.foundedYear`.

Free email domains such as gmail.com skip the organization lookup. Organization results are cached per domain for 7 days, which saves credits.

## Setup

1. In Apollo, open **Settings → Integrations → API** and create a key. A master key is required for `people/match`.
2. Paste the key into **Dashboard → Integrations → Apollo.io** and click **Test connection**. This calls `GET /api/v1/auth/health`.
3. Make sure **Apollo** is enabled for the form under **Form → Settings → Enrichment**. It's on by default.

Or set `APOLLO_API_KEY` in the environment.

## Behaviour

- Timeout: 15 seconds by default (`FORMFORGE_PROVIDER_TIMEOUT_MS`). A timeout or error is logged, and the waterfall continues.
- Apollo has priority 1, so its fields win over any other provider's.
- Credits: 1 credit is logged for each person or organization lookup.
