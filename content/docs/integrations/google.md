# Google Calendar & Gmail

Connect each rep's Google account so FormForge can:

1. Read **free/busy** and offer real slots after a lead is routed
2. Create a Calendar event with a **Google Meet** link
3. Send the confirmation from the rep's **Gmail**

## Setup

1. Create an OAuth 2.0 Client ID (Web application) in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Enable the **Google Calendar API** and **Gmail API**.
3. Add this authorized redirect URI (exact match):

```
{{BASE}}/api/oauth/google/callback
```

4. Either set env vars or paste the credentials in **Dashboard → Integrations → Google**:

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |

5. Click **Connect Google** and approve Calendar + Gmail scopes.

## Scopes

- `calendar.events` — create events with Meet
- `calendar.freebusy` — availability
- `gmail.send` — confirmation email
- `openid email profile` — identify the account

## Runtime behaviour

- After routing, the hosted thank-you step fetches `/api/v1/booking/slots?submissionId=…`.
- If the assigned owner is connected, the lead picks a slot; FormForge creates the event and emails them.
- If the owner is not connected, FormForge falls back to the rule's external `bookingUrl` (Calendly-style) and the in-app email outbox.
- Round-robin skips connected reps who have **no free slots** in the next 5 days (unconnected reps stay eligible).

Tokens are encrypted at rest (AES-256-GCM) and refreshed automatically.
