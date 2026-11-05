# Status & health

A monitor runs in the worker every 60 seconds and probes each component end to end:

| Component | Probe |
|---|---|
| Database | Read-after-write check |
| Storage | Writes and deletes a file in the data directory, then checks free disk space |
| Ingest | A real synthetic submission to a hidden system form, which is then cleaned up |
| REST API | `GET /api/v1/forms` with a system key |
| OpenAPI | The spec parses |
| MCP | `tools/list` over Streamable HTTP |
| Webhooks | A signed delivery to an internal echo endpoint, with the signature verified |
| Queue / scheduler | Heartbeat age |
| Email | Transport (SMTP verify or outbox) |
| Routing | Rule engine self-test |
| Local enrichment | Offline datasets loaded |
| Each provider | `configured` → health check, otherwise `disabled` (no key) |

If a component fails **2 checks in a row**, an **incident** opens. It resolves automatically when the component recovers. Set `ALERT_WEBHOOK_URL` and/or `ALERT_EMAIL` to be notified.

## Endpoints

| Endpoint | Auth | Use |
|---|---|---|
| `GET /api/health` | none | Liveness (process up, DB reachable) |
| `GET /api/health/ready` | none | Readiness. Returns `503` if any component is `down`. Disabled providers don't count. |
| `GET /api/v1/status` | API key | Full component detail, uptime and incidents |
| [`/status`](/status) | public | Status page with 90-day uptime bars, latency sparklines and incidents |

The **UI QA agent** (`npm run agent:ui`) also reports its last result to the status page.
