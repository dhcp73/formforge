# Dynamic fields & schemas

By default FormForge is **schemaless**. Every field you post is stored, and its type is detected automatically (email, url, number, phone, date, boolean, longtext, file). The dashboard builds table columns from whatever keys arrive.

## Schema modes

| Mode | Behaviour |
|---|---|
| `off` (default) | Accept anything, detect types |
| `validate` | Validate the defined fields (required, type, min/max length, regex) and keep any extra fields |
| `strict` | Like validate, but reject unknown fields |

Define fields in **Form → Settings → Fields & schema**, or through the API:

```bash
curl -X PATCH {{BASE}}/api/v1/forms/$FORM \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"settings":{"schemaMode":"validate","fields":[
        {"name":"email","type":"email","required":true},
        {"name":"seats","type":"number"},
        {"name":"code","type":"text","pattern":"^[A-Z]{2}\\d{4}$","patternMessage":"Use AB1234"}
      ]}}'
```

Validation failures return `422` with per-field details:

```json
{ "ok": false, "status": "error", "code": "validation_failed", "message": "Validation failed", "errors": { "email": "Must be a valid email" } }
```

HTML submissions are redirected to the thank-you page instead, with the error and a link back to your form.

## Coercion

When a field has a type, values are coerced before they're stored:

- `"42"` becomes `42` for `number`
- `"on"` or `"true"` becomes `true` for `boolean`
- dates are normalised to ISO format

## Field mapping

Different sites often post different keys. A mapping renames them on the way in:

```
Email Address => email
your-name => name
```

A field can also set `renameTo` to store it under another key.

## Branching logic

Any field can carry a `showIf` condition that refers to another field. When the condition is false the field is **hidden** on the hosted form, it is **not required** (even if `required: true`), and any value sent for it is **dropped** before storage, so stale answers from a previous branch never reach your webhooks or CRM. Conditions can chain: a field whose controlling field is hidden is hidden too. Cycles are guarded.

```json
{
  "schemaMode": "validate",
  "fields": [
    { "name": "topic", "type": "select", "required": true, "options": ["Sales", "Support"] },
    { "name": "seats", "type": "number", "required": true, "showIf": { "field": "topic", "op": "eq", "value": "Sales" } },
    { "name": "budget", "type": "text", "required": true, "showIf": { "field": "seats", "op": "gt", "value": 100 } },
    { "name": "order_id", "type": "text", "required": true, "showIf": { "field": "topic", "op": "eq", "value": "Support" } }
  ]
}
```

| `op` | Meaning |
| --- | --- |
| `eq` / `neq` | Case-insensitive equality |
| `in` / `not_in` | Value is (not) one of an array or comma-separated list |
| `contains` | Substring match |
| `gt` / `lt` | Numeric comparison |
| `filled` / `empty` | Any value / no value |

Edit conditions in **Form → Settings → Fields → Rules → Branching logic**. The `select` field type validates that the answer is one of `options`. The seeded **Beta waitlist** form shows a working example ("Your role" → "Which role?" when *Other*).
