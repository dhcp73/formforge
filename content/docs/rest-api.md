# REST API

- Base URL: `{{BASE}}/api/v1`
- OpenAPI 3.1 spec: [`/api/v1/openapi.json`](/api/v1/openapi.json)
- Interactive reference: [`/docs/api`](/docs/api)

| Method & path | Scope | Description |
|---|---|---|
| `GET /me` | any | The key's workspace and scopes |
| `GET /forms` · `POST /forms` | forms:read / write | List and create forms |
| `GET/PATCH/DELETE /forms/{id}` | forms:* | Read, update and delete a form |
| `GET /forms/{id}/submissions` | submissions:read | Submissions for one form |
| `GET /forms/{id}/export?format=csv\|json` | submissions:read | Export |
| `GET /submissions?q=&spam=&status=&owner=&min_fit=&page=&limit=` | submissions:read | Search across forms |
| `GET/PATCH/DELETE /submissions/{id}` | submissions:* | Read, update (status, owner, tags, spam) and delete |
| `POST /submissions/{id}/enrich` | submissions:write | Re-run enrichment and routing |
| `GET /submissions/{id}/files/{index}` | submissions:read | Download an uploaded file |
| `GET /enrichment/config` | submissions:read | Which providers are enabled |
| `POST /research` · `GET /research/{taskId}` | submissions:write / read | Valyu company research |
| `GET/POST /forms/{id}/webhooks` | automations:* | Webhooks |
| `GET/PATCH/DELETE /webhooks/{id}` · `GET /webhooks/{id}/deliveries` · `POST /webhooks/{id}/test` | automations:* | |
| `GET/POST /forms/{id}/schedules` · `PATCH/DELETE /schedules/{id}` · `POST /schedules/{id}/run` | automations:* | Schedules |
| `GET/POST /routing/rules` · `PATCH/DELETE /routing/rules/{id}` | automations:* | Routing rules |
| `GET /stats` | submissions:read | Workspace analytics |
| `GET /status` | any | Full system health |

Errors always use this shape:

```json
{ "error": { "code": "validation_failed", "message": "Human readable message", "details": [ … ] } }
```

The status codes are:

| Code | Meaning |
|---|---|
| `400` | Bad request |
| `401` | Missing or invalid key |
| `403` | Insufficient scope |
| `404` | Not found |
| `409` | Provider disabled |
| `422` | Validation error |
| `429` | Rate limited |
