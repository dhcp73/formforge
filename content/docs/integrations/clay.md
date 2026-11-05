# Clay

Clay works **asynchronously**. FormForge pushes each lead to a Clay table, your table enriches it with any Clay waterfall, and an HTTP API column posts the results back.

## 1. Outbound: FormForge → Clay

1. In Clay, create a table with a **Webhook** source and copy its URL.
2. Paste the URL into **Dashboard → Integrations → Clay → Clay table webhook URL** and click Save. A **callback secret** is generated for you.

Every non-spam submission is sent like this:

```json
{ "submission_id": "sub_…", "workspace_id": "…", "form_id": "…", "email": "ada@stripe.com", "domain": "stripe.com", "company": "Stripe",
  "fields": { … }, "callback_url": "{{BASE}}/api/integrations/clay/callback", "callback_header": "X-FormForge-Clay-Secret" }
```

## 2. Inbound: Clay → FormForge

Add an **HTTP API** column at the end of the table:

- Method `POST`, URL `{{BASE}}/api/integrations/clay/callback`
- Header `X-FormForge-Clay-Secret: <callback secret>`. You can send `X-FormForge-Signature: sha256=<hex HMAC-SHA256 of the raw body>` instead.
- Body: `submission_id` plus any enriched columns, for example:

```json
{ "submission_id": "{{submission_id}}", "company_name": "Stripe", "employee_count": 8000, "industry": "Fintech", "job_title": "CTO", "hq_country": "US" }
```

Column names are matched flexibly, for example `employees`, `employee_count`, `company_size` or `headcount`. Mapped values merge into the submission with source `clay` and priority 2. Unless you turn it off, **routing re-runs** on the merged data.

Requests with a missing or wrong secret are rejected with `401`.
