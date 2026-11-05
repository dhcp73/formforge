# Microsoft Outlook & Teams

Connect each rep's Microsoft 365 account so FormForge can:

1. Read availability via Graph **getSchedule**
2. Create an Outlook event with a **Teams** meeting link
3. Send the confirmation with **Outlook Mail** (`sendMail`)

## Setup

1. Register an app in [Microsoft Entra ID](https://entra.microsoft.com/) → App registrations.
2. Add a Web redirect URI:

```
{{BASE}}/api/oauth/microsoft/callback
```

3. Create a client secret. Add API permissions (delegated): `Calendars.ReadWrite`, `Mail.Send`, `User.Read`, `offline_access`.
4. Set env vars or paste credentials in **Dashboard → Integrations → Microsoft**:

| Variable | Purpose |
|---|---|
| `MICROSOFT_CLIENT_ID` | Application (client) ID |
| `MICROSOFT_CLIENT_SECRET` | Client secret value |
| `MICROSOFT_TENANT` | `common` (default), `organizations`, or a tenant ID |

5. Click **Connect Microsoft** and consent.

## Runtime behaviour

Same booking flow as Google (see [Google](/docs/integrations/google)). Meet/Teams links are returned as `meet_url` from `POST /api/v1/booking`.

Auth uses MSAL (`@azure/msal-node`) for the code exchange, with a REST fallback used in tests.
