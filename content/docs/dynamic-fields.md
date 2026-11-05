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
