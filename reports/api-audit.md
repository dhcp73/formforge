# API audit report

Generated: 2026-11-05T10:59:20.410Z

**Summary:** 37 passed · 0 failed · 37 endpoints/groups

| Endpoint | Method | Cases | Result |
| --- | --- | --- | --- |
| `/api/health` | GET | ✓ public (200) | **pass** |
| `/api/health/ready` | GET | ✓ public (200) | **pass** |
| `/api/f/{formId}` | POST | ✓ valid body (200)<br>✓ empty body (422)<br>✓ missing form (404)<br>✓ OPTIONS cors (204) | **pass** |
| `/api/v1/openapi.json` | GET | ✓ public (200) | **pass** |
| `/api/v1/me` | GET | ✓ missing auth (401)<br>✓ valid auth (200) | **pass** |
| `/api/v1/forms` | GET | ✓ missing auth (401)<br>✓ wrong scope (200)<br>✓ valid auth (200) | **pass** |
| `/api/v1/forms` | POST | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ invalid body (400)<br>✓ valid auth (201) | **pass** |
| `/api/v1/forms/{formId}` | GET | ✓ missing auth (401)<br>✓ wrong scope (200)<br>✓ valid auth (200) | **pass** |
| `/api/v1/forms/{formId}` | PATCH | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ invalid body (400)<br>✓ valid auth (200) | **pass** |
| `/api/v1/forms/{formId}/submissions` | GET | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/submissions` | GET | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/stats` | GET | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/status` | GET | ✓ missing auth (401)<br>✓ valid auth (200) | **pass** |
| `/api/v1/enrichment/config` | GET | ✓ missing auth (401)<br>✓ wrong scope (200)<br>✓ valid auth (200) | **pass** |
| `/api/v1/routing/rules` | GET | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/routing/rules` | POST | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ invalid body (422)<br>✓ valid auth (201) | **pass** |
| `/api/v1/routing/rules/{ruleId}` | PATCH | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/forms/{formId}/webhooks` | POST | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ invalid body (422)<br>✓ valid auth (201) | **pass** |
| `/api/v1/forms/{formId}/webhooks` | GET | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/webhooks/{webhookId}` | PATCH | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/webhooks/{webhookId}/deliveries` | GET | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/webhooks/{webhookId}/test` | POST | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/forms/{formId}/schedules` | POST | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ invalid body (422)<br>✓ valid auth (201) | **pass** |
| `/api/v1/forms/{formId}/schedules` | GET | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/schedules/{scheduleId}` | PATCH | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/schedules/{scheduleId}/run` | POST | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/forms/{formId}/export` | GET | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/research` | POST | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ invalid body (400)<br>✓ valid auth (409) | **pass** |
| `/api/v1/booking/slots` | GET | ✓ missing submissionId (400)<br>✓ valid submissionId (200) | **pass** |
| `/api/mcp` | POST | ✓ missing auth (401)<br>✓ valid auth initialize (200) | **pass** |
| `/api/integrations/clay/callback` | POST | ✓ missing/invalid secret (404) | **pass** |
| `/api/integrations/valyu/webhook` | POST | ✓ missing/invalid signature (404) | **pass** |
| `webhook.events → local receiver` | POST | ✓ event submission.created delivered (200)<br>✓ event submission.enriched delivered (200)<br>✓ event submission.routed delivered (200)<br>✓ event enrichment.completed delivered (200)<br>✓ event routing.assigned delivered (200)<br>✓ HMAC signatures valid (200) | **pass** |
| `/api/v1/routing/rules/{ruleId}` | DELETE | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/schedules/{scheduleId}` | DELETE | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/webhooks/{webhookId}` | DELETE | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
| `/api/v1/forms/{formId}` | DELETE | ✓ missing auth (401)<br>✓ wrong scope (403)<br>✓ valid auth (200) | **pass** |
