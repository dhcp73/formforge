# API keys

Keys look like `ff_live_` followed by 32 random characters.

- Only a **SHA-256 hash** and a short **prefix** are stored. The full key is shown once, when it's created.
- Keys are tied to a workspace.
- Keys can have an expiry date.
- Each key records when it was **last used**.

Send a key with either header:

```
Authorization: Bearer ff_live_…
x-api-key: ff_live_…
```

## Scopes

| Scope | Grants |
|---|---|
| `forms:read` | List and read forms |
| `forms:write` | Create, update and delete forms |
| `submissions:read` | List, search and export submissions; stats |
| `submissions:write` | Update, delete, re-enrich; research |
| `automations:read` | Webhooks, deliveries, schedules, routing rules |
| `automations:write` | Manage webhooks, schedules and routing rules |

If a request uses a key without the required scope, it gets `403 insufficient_scope`.

## Rotate and revoke

- **Rotate** creates a new key with the same scopes and immediately revokes the old one.
- **Revoke** takes effect instantly.

Both are available in **Dashboard → API & keys**.
