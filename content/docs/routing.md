# Lead routing

Routing rules run after enrichment, in priority order (lowest number first), against the **merged** data. They also re-run when late enrichment arrives, for example from a Clay callback or Valyu DeepResearch.

## Conditions

Conditions can read any answer (`data.*`) or enrichment path:

`company.employees`, `company.country`, `company.industry`, `company.domain`, `company.revenue`, `person.title`, `person.seniority`, `geo.country`, `email.freeProvider`, `email.disposable`, `ai.intent`, `ai.icpScore`, `fitScore`, `spamScore`, `data.<field>`

The available operators are:

| Group | Operators |
|---|---|
| Equality | `eq`, `neq` |
| Text | `contains`, `not_contains`, `ends_with`, `matches` (regex) |
| Comparison | `gt`, `gte`, `lt`, `lte` |
| Lists | `in`, `not_in` |
| Presence | `exists`, `not_exists` |

## Actions

- `assignTo`: one or more owners. When there are several, leads are assigned **round-robin**.
- `weights`: **weighted round-robin**, for example `{"ava@acme.com": 2}` gives Ava two leads for every one the others get. Weight `0` pauses an owner. FormForge uses a smooth weighted sequence, so a heavy owner never gets a long run of leads in a row. In the rule editor, write `ava@acme.com*2`.
- `sticky`: **account-owner stickiness**. If an earlier non-spam lead from the same company domain already has an owner, the new lead goes to that owner. The domain is the enriched `company.domain`, or else the email domain (free providers such as gmail.com are ignored).
- `bookingUrl`: a booking link shown to the lead **right after submit**. Placeholders: `{{owner}}`, `{{owner_name}}` (the part before @), `{{email}}`, `{{name}}` and `{{company}}`, all URL-encoded.
- `ownerBookingUrls`: per-owner links (`owner → URL`), which take priority over `bookingUrl`.
- `tags`: added to the lead
- `notifyEmails`: an email is sent to these addresses
- `webhookUrl`: a signed POST to this URL
- `markSpam`
- `stopOnMatch`: stop evaluating later rules

```bash
curl -X POST {{BASE}}/api/v1/routing/rules -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{
  "name": "EMEA enterprise",
  "match": "all",
  "conditions": [
    {"field":"company.employees","op":"gte","value":200},
    {"field":"geo.country","op":"in","value":["GB","DE","FR"]}
  ],
  "actions": {"assignTo":["ava@acme.com","sam@acme.com"],"weights":{"ava@acme.com":2},"sticky":true,
              "bookingUrl":"https://cal.com/{{owner_name}}/intro","tags":["enterprise"]}
}'
```

## Instant routing and booking links

When a lead is submitted, FormForge routes it at once using the offline enrichment, which takes a few milliseconds and needs no network calls. The owner is promised immediately. The response includes the booking link:

```json
{ "ok": true, "status": "success", "id": "sub_…", "spam": false, "booking_url": "https://cal.com/ava/enterprise-demo" }
```

HTML forms get the same link on the hosted thank-you page (`/thanks?…&book=`), with a **Book a meeting** button. Hosted forms (`/f/{id}`) show the button inline. After provider enrichment (Apollo, Clay, Valyu, AI), the worker routes again on the merged data. If the lead still matches a rule that can assign the promised owner, that owner is kept, so the lead's booking link stays valid. Spam never gets an owner or a booking link.

The decision, with a step-by-step explanation, is stored on the submission (`routing.steps`) and shown in the **Routing** tab of the record drawer.
