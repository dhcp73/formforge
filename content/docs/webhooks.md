# Webhooks

Webhooks POST JSON to your URL when one of these events happens:

- `submission.created`
- `submission.enriched`
- `submission.routed`

## Signature

Every request includes these headers:

```
X-FormForge-Event: submission.created
X-FormForge-Delivery: dlv_…
X-FormForge-Signature: t=1730700000,v1=5d41402abc4b2a76b9719d911017c592…
```

`v1` is `HMAC_SHA256(secret, "{t}.{rawBody}")` in hex. To verify a request:

```ts
import crypto from "node:crypto";
function verify(header: string, rawBody: string, secret: string, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}
```

## Retries

A delivery that doesn't return `2xx` is retried up to 5 attempts in total: immediately, then after 30 seconds, 2 minutes, 10 minutes and 1 hour.

Every attempt is logged with:

- status
- response code and body
- duration

You can see the log in **Dashboard → Webhooks**, redeliver from there, or use `GET /api/v1/webhooks/{id}/deliveries`.

## Payload

```json
{
  "event": "submission.created",
  "created_at": "2026-11-04T09:00:00.000Z",
  "form": { "id": "AbC123xYz0", "name": "Contact sales" },
  "submission": { "id": "sub_…", "data": { "email": "ada@stripe.com" }, "enrichment": { … }, "routing": { … }, "spam": { "score": 4, "is_spam": false } }
}
```
