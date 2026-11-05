# Scheduling

## Open/close windows and caps

Each form can set:

- `opensAt`: before this time, the form returns `410 not_open_yet`
- `closesAt`: after this time, it returns `410 closed`
- `maxSubmissions`: once reached, it returns `410 cap_reached`
- `closedMessage`: shown on the hosted form and the thank-you page

Set these in **Form → Settings → Schedule window**, or under `settings` in the API.

## Scheduled jobs

Schedules run on cron expressions with an IANA timezone. They're executed by the background job runner, which is durable, retries failures and survives restarts.

| Kind | What it does |
|---|---|
| `digest` | Emails a summary of new submissions since the last run |
| `webhook_export` | POSTs a signed batch of new submissions to a URL |
| `csv_export` | Writes a CSV file you can download from **Dashboard → Schedules** |

```bash
curl -X POST {{BASE}}/api/v1/forms/$FORM/schedules -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"name":"Daily digest","kind":"digest","cron":"0 9 * * 1-5","timezone":"Europe/London","config":{"recipients":["sales@acme.com"]}}'

# run immediately
curl -X POST {{BASE}}/api/v1/schedules/$SCHEDULE/run -H "Authorization: Bearer $KEY"
```

If `SMTP_URL` isn't configured, emails are recorded in the **Outbox** so you can check them.
