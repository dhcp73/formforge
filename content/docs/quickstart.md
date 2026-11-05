# Quickstart

## 1. Create a form

Sign in, open **Forms → New form** and give it a name. You get an endpoint like:

```
{{BASE}}/api/f/AbC123xYz0
```

## 2. Point a form at it

```html
<form action="{{BASE}}/api/f/AbC123xYz0" method="POST">
  <input name="email" type="email" required>
  <textarea name="message"></textarea>
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <button>Send</button>
</form>
```

HTML submissions are redirected to your **redirect URL**, or to the hosted thank-you page if you haven't set one. To get JSON back instead, send `Accept: application/json`:

```bash
curl -X POST {{BASE}}/api/f/AbC123xYz0 \
  -H "Accept: application/json" -H "Content-Type: application/json" \
  -d '{"email":"ada@stripe.com","message":"Hi!"}'
# {"ok":true,"status":"success","id":"sub_…","spam":false}
```

The endpoint accepts:

- `application/x-www-form-urlencoded`
- `multipart/form-data` (files up to 10 MB each, 25 MB in total)
- `application/json`

CORS is enabled, so browsers can post from any origin unless you restrict it with **allowed domains**.

## 3. Watch it arrive

Open the form in the dashboard. The submission appears with its email verification, geolocation, device and company already filled in. Click a row to open the record drawer, which has these tabs:

- **Answers**
- **Enrichment** (with the source of each field)
- **Routing timeline**
- **Activity / webhook logs**
- **Raw JSON**

## 4. Automate

- Add a [webhook](/docs/webhooks) to push each submission to your stack.
- Create [routing rules](/docs/routing) to assign leads to reps.
- Create an [API key](/docs/api-keys) and use the [REST API](/docs/rest-api) or the [MCP server](/docs/mcp).

## Special fields

| Field | Purpose |
|---|---|
| `_gotcha` | Honeypot (configurable). If it has a value, the submission is quietly sent to Spam. |
| `_next` / `_redirect` | Per-submission redirect URL |
| `_subject` | Subject line for notification emails |
