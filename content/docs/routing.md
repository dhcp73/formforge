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
  "actions": {"assignTo":["ava@acme.com","sam@acme.com"],"tags":["enterprise"]}
}'
```

The decision, with a step-by-step explanation, is stored on the submission (`routing.steps`) and shown in the **Routing** tab of the record drawer.
