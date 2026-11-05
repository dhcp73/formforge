/** Hand-maintained OpenAPI 3.1 document for the FormForge developer API. */
const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema: unknown, description = "OK") => ({ description, content: { "application/json": { schema } } });
const err = { 400: { $ref: "#/components/responses/BadRequest" }, 401: { $ref: "#/components/responses/Unauthorized" }, 403: { $ref: "#/components/responses/Forbidden" }, 404: { $ref: "#/components/responses/NotFound" }, 422: { $ref: "#/components/responses/Validation" } };
const p = (name: string, d: string) => ({ name, in: "path", required: true, schema: { type: "string" }, description: d });
const q = (name: string, schema: unknown, d: string) => ({ name, in: "query", required: false, schema, description: d });
const body = (schema: unknown) => ({ required: true, content: { "application/json": { schema } } });
const op = (tag: string, summary: string, scope: string | null, extra: Record<string, unknown>) => ({ tags: [tag], summary, ...(scope ? { description: `Required scope: \`${scope}\`` } : {}), ...extra, responses: { ...(extra.responses as object), ...err } });

export function openApiDocument(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "FormForge API", version: "1.0.0",
      description: "Developer API for FormForge — form endpoints, schema-less submissions, enrichment, routing, webhooks and schedules.\n\nAuthenticate with an API key from **Dashboard → API keys**: `Authorization: Bearer ff_live_…`. Keys are scoped.",
    },
    servers: [{ url: `${serverUrl}/api/v1`, description: "FormForge API" }],
    security: [{ bearerAuth: [] }],
    tags: ["Account", "Forms", "Submissions", "Enrichment", "Routing", "Webhooks", "Schedules", "Status", "Public submission"].map((name) => ({ name })),
    paths: {
      "/me": { get: op("Account", "Current API key & workspace", null, { responses: { 200: json(ref("Me")) } }) },
      "/stats": { get: op("Account", "Workspace statistics", "submissions:read", { responses: { 200: json({ type: "object" }) } }) },
      "/forms": {
        get: op("Forms", "List forms", "forms:read", { responses: { 200: json({ type: "object", properties: { data: { type: "array", items: ref("Form") } } }) } }),
        post: op("Forms", "Create form", "forms:write", { requestBody: body(ref("FormInput")), responses: { 201: json(ref("Form"), "Created") } }),
      },
      "/forms/{formId}": {
        parameters: [p("formId", "Form ID")],
        get: op("Forms", "Get form", "forms:read", { responses: { 200: json(ref("Form")) } }),
        patch: op("Forms", "Update form", "forms:write", { requestBody: body(ref("FormInput")), responses: { 200: json(ref("Form")) } }),
        delete: op("Forms", "Delete form", "forms:write", { responses: { 200: json(ref("Deleted")) } }),
      },
      "/forms/{formId}/submissions": {
        parameters: [p("formId", "Form ID")],
        get: op("Submissions", "List submissions for a form", "submissions:read", {
          parameters: [
            q("q", { type: "string" }, "Full-text search"), q("spam", { type: "string", enum: ["false", "true", "all"], default: "false" }, "Spam filter"),
            q("status", { type: "string", enum: ["new", "read", "archived"] }, "Status"), q("owner", { type: "string" }, "Routed owner"), q("tag", { type: "string" }, "Tag"),
            q("since", { type: "string", format: "date-time" }, "Created at or after"), q("until", { type: "string", format: "date-time" }, "Created at or before"),
            q("min_fit", { type: "integer" }, "Minimum fit score"), q("sort", { type: "string", enum: ["created_at", "fit_score", "spam_score"] }, "Sort field"),
            q("order", { type: "string", enum: ["asc", "desc"] }, "Sort order"), q("page", { type: "integer", default: 1 }, "Page"), q("limit", { type: "integer", default: 25, maximum: 200 }, "Page size"),
          ],
          responses: { 200: json(ref("SubmissionList")) },
        }),
      },
      "/forms/{formId}/export": {
        parameters: [p("formId", "Form ID")],
        get: op("Submissions", "Export submissions (CSV or JSON)", "submissions:read", {
          parameters: [q("format", { type: "string", enum: ["csv", "json"], default: "csv" }, "Format"), q("since", { type: "string", format: "date-time" }, "Since"), q("spam", { type: "string", enum: ["false", "true", "all"] }, "Spam filter")],
          responses: { 200: { description: "File download", content: { "text/csv": { schema: { type: "string" } }, "application/json": { schema: { type: "array", items: ref("Submission") } } } } },
        }),
      },
      "/submissions": {
        get: op("Submissions", "Search submissions across forms", "submissions:read", { parameters: [q("q", { type: "string" }, "Search"), q("form_id", { type: "string" }, "Form"), q("spam", { type: "string" }, "Spam"), q("page", { type: "integer" }, "Page"), q("limit", { type: "integer" }, "Limit")], responses: { 200: json(ref("SubmissionList")) } }),
      },
      "/submissions/{submissionId}": {
        parameters: [p("submissionId", "Submission ID")],
        get: op("Submissions", "Get submission", "submissions:read", { responses: { 200: json(ref("Submission")) } }),
        patch: op("Submissions", "Update status / spam / owner / tags", "submissions:write", { requestBody: body({ type: "object", properties: { status: { type: "string", enum: ["new", "read", "archived"] }, is_spam: { type: "boolean" }, owner: { type: ["string", "null"] }, tags: { type: "array", items: { type: "string" } } } }), responses: { 200: json(ref("Submission")) } }),
        delete: op("Submissions", "Delete submission", "submissions:write", { responses: { 200: json(ref("Deleted")) } }),
      },
      "/submissions/{submissionId}/enrich": {
        parameters: [p("submissionId", "Submission ID")],
        post: op("Enrichment", "Re-run enrichment waterfall + routing", "submissions:write", { responses: { 200: json(ref("Submission")) } }),
      },
      "/submissions/{submissionId}/files/{index}": {
        parameters: [p("submissionId", "Submission ID"), p("index", "File index")],
        get: op("Submissions", "Download uploaded file", "submissions:read", { responses: { 200: { description: "File", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } } } }),
      },
      "/enrichment/config": { get: op("Enrichment", "Enrichment provider configuration", "forms:read", { responses: { 200: json({ type: "object" }) } }) },
      "/research": { post: op("Enrichment", "Research a company with Valyu (search or DeepResearch)", "submissions:write", { requestBody: body({ type: "object", properties: { domain: { type: "string" }, company: { type: "string" }, mode: { type: "string", enum: ["search", "fast", "standard", "heavy", "max"], default: "search" }, submission_id: { type: "string" } } }), responses: { 200: json({ type: "object" }), 409: { description: "Valyu not configured" } } }) },
      "/research/{taskId}": { parameters: [p("taskId", "Research task ID")], get: op("Enrichment", "Get research task", "submissions:read", { responses: { 200: json({ type: "object" }) } }) },
      "/routing/rules": {
        get: op("Routing", "List routing rules", "automations:read", { responses: { 200: json({ type: "object", properties: { data: { type: "array", items: ref("RoutingRule") } } }) } }),
        post: op("Routing", "Create routing rule", "automations:write", { requestBody: body(ref("RoutingRuleInput")), responses: { 201: json(ref("RoutingRule"), "Created") } }),
      },
      "/routing/rules/{ruleId}": {
        parameters: [p("ruleId", "Rule ID")],
        patch: op("Routing", "Update routing rule", "automations:write", { requestBody: body(ref("RoutingRuleInput")), responses: { 200: json(ref("RoutingRule")) } }),
        delete: op("Routing", "Delete routing rule", "automations:write", { responses: { 200: json(ref("Deleted")) } }),
      },
      "/forms/{formId}/webhooks": {
        parameters: [p("formId", "Form ID")],
        get: op("Webhooks", "List webhooks", "automations:read", { responses: { 200: json({ type: "object", properties: { data: { type: "array", items: ref("Webhook") } } }) } }),
        post: op("Webhooks", "Create webhook", "automations:write", { requestBody: body(ref("WebhookInput")), responses: { 201: json(ref("Webhook"), "Created") } }),
      },
      "/webhooks/{webhookId}": {
        parameters: [p("webhookId", "Webhook ID")],
        patch: op("Webhooks", "Update webhook", "automations:write", { requestBody: body(ref("WebhookInput")), responses: { 200: json(ref("Webhook")) } }),
        delete: op("Webhooks", "Delete webhook", "automations:write", { responses: { 200: json(ref("Deleted")) } }),
      },
      "/webhooks/{webhookId}/deliveries": { parameters: [p("webhookId", "Webhook ID")], get: op("Webhooks", "Delivery log", "automations:read", { responses: { 200: json({ type: "object" }) } }) },
      "/webhooks/{webhookId}/test": { parameters: [p("webhookId", "Webhook ID")], post: op("Webhooks", "Send a signed test event", "automations:write", { responses: { 200: json({ type: "object" }) } }) },
      "/forms/{formId}/schedules": {
        parameters: [p("formId", "Form ID")],
        get: op("Schedules", "List schedules", "automations:read", { responses: { 200: json({ type: "object", properties: { data: { type: "array", items: ref("Schedule") } } }) } }),
        post: op("Schedules", "Create schedule (digest, webhook export, CSV export)", "automations:write", { requestBody: body(ref("ScheduleInput")), responses: { 201: json(ref("Schedule"), "Created") } }),
      },
      "/schedules/{scheduleId}": {
        parameters: [p("scheduleId", "Schedule ID")],
        patch: op("Schedules", "Update schedule", "automations:write", { requestBody: body(ref("ScheduleInput")), responses: { 200: json(ref("Schedule")) } }),
        delete: op("Schedules", "Delete schedule", "automations:write", { responses: { 200: json(ref("Deleted")) } }),
      },
      "/schedules/{scheduleId}/run": { parameters: [p("scheduleId", "Schedule ID")], post: op("Schedules", "Run schedule now", "automations:write", { responses: { 200: json({ type: "object", properties: { status: { type: "string" }, detail: { type: "string" } } }) } }) },
      "/status": { get: op("Status", "System health (per component)", null, { responses: { 200: json({ type: "object" }) } }) },
    },
    webhooks: {
      "submission.created": { post: { summary: "Sent after a submission is stored, enriched and routed", requestBody: { content: { "application/json": { schema: { type: "object", properties: { event: { type: "string" }, form: { type: "object" }, submission: ref("Submission") } } } } }, responses: { 200: { description: "Return 2xx to acknowledge" } } } },
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "ff_live_…" } },
      responses: {
        BadRequest: json(ref("Error"), "Bad request"), Unauthorized: json(ref("Error"), "Missing/invalid API key"), Forbidden: json(ref("Error"), "Insufficient scope"),
        NotFound: json(ref("Error"), "Not found"), Validation: json(ref("Error"), "Validation failed"),
      },
      schemas: {
        Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: {} } } } },
        Deleted: { type: "object", properties: { deleted: { type: "boolean" }, id: { type: "string" } } },
        Me: { type: "object", properties: { key_id: { type: "string" }, workspace: { type: "object" }, scopes: { type: "array", items: { type: "string" } } } },
        FieldDef: { type: "object", required: ["name"], properties: { name: { type: "string" }, label: { type: "string" }, type: { type: "string", enum: ["text", "email", "number", "url", "phone", "date", "boolean", "file", "longtext"] }, required: { type: "boolean" }, pattern: { type: "string" }, patternMessage: { type: "string" }, minLength: { type: "integer" }, maxLength: { type: "integer" }, renameTo: { type: "string" } } },
        FormSettings: {
          type: "object", properties: {
            redirectUrl: { type: "string" }, allowedDomains: { type: "array", items: { type: "string" } }, honeypotField: { type: "string" }, spamThreshold: { type: "integer" }, spamAction: { type: "string", enum: ["flag", "reject"] },
            rateLimitPerMinute: { type: "integer" }, schemaMode: { type: "string", enum: ["off", "validate", "strict"] }, fields: { type: "array", items: ref("FieldDef") }, fieldMapping: { type: "object", additionalProperties: { type: "string" } },
            opensAt: { type: ["string", "null"], format: "date-time" }, closesAt: { type: ["string", "null"], format: "date-time" }, maxSubmissions: { type: ["integer", "null"] }, notifyEmails: { type: "array", items: { type: "string" } },
            autoresponder: { type: "object" }, enrichment: { type: "object" },
          },
        },
        FormInput: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, status: { type: "string", enum: ["active", "paused"] }, settings: ref("FormSettings") } },
        Form: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, status: { type: "string" }, endpoint: { type: "string" }, settings: ref("FormSettings"), submission_count: { type: "integer" }, created_at: { type: "string" }, updated_at: { type: "string" } } },
        Submission: {
          type: "object", properties: {
            id: { type: "string" }, form_id: { type: "string" }, created_at: { type: "string" }, data: { type: "object", additionalProperties: true }, field_types: { type: "object" },
            files: { type: "array", items: { type: "object" } }, enrichment: { type: "object", description: "Merged enrichment; `attribution` maps each field to its source provider" },
            spam: { type: "object", properties: { score: { type: "integer" }, is_spam: { type: "boolean" }, reasons: { type: "array", items: { type: "string" } } } },
            routing: { type: "object" }, owner: { type: ["string", "null"] }, tags: { type: "array", items: { type: "string" } }, fit_score: { type: ["integer", "null"] }, status: { type: "string" }, enrichment_status: { type: "string" },
          },
        },
        SubmissionList: { type: "object", properties: { data: { type: "array", items: ref("Submission") }, pagination: { type: "object", properties: { page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }, total_pages: { type: "integer" } } } } },
        WebhookInput: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" }, events: { type: "array", items: { type: "string", enum: ["submission.created", "submission.enriched", "submission.routed"] } }, include_spam: { type: "boolean" }, active: { type: "boolean" } } },
        Webhook: { type: "object", properties: { id: { type: "string" }, form_id: { type: "string" }, url: { type: "string" }, events: { type: "array", items: { type: "string" } }, include_spam: { type: "boolean" }, active: { type: "boolean" }, secret: { type: "string" } } },
        ScheduleInput: { type: "object", required: ["name", "kind", "cron"], properties: { name: { type: "string" }, kind: { type: "string", enum: ["digest", "webhook_export", "csv_export"] }, cron: { type: "string", example: "0 9 * * *" }, timezone: { type: "string", example: "Europe/London" }, config: { type: "object", properties: { recipients: { type: "array", items: { type: "string" } }, url: { type: "string" }, includeSpam: { type: "boolean" } } }, active: { type: "boolean" } } },
        Schedule: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, kind: { type: "string" }, cron: { type: "string" }, timezone: { type: "string" }, next_run_at: { type: "string" }, last_run_at: { type: ["string", "null"] }, last_status: { type: ["string", "null"] } } },
        Condition: { type: "object", properties: { field: { type: "string", example: "company.employees" }, op: { type: "string", enum: ["eq", "neq", "contains", "not_contains", "gt", "gte", "lt", "lte", "in", "not_in", "exists", "not_exists", "ends_with", "matches"] }, value: {} } },
        RoutingRuleInput: { type: "object", required: ["name", "conditions"], properties: { name: { type: "string" }, form_id: { type: ["string", "null"] }, priority: { type: "integer" }, match: { type: "string", enum: ["all", "any"] }, conditions: { type: "array", items: ref("Condition") }, actions: { type: "object", properties: { assignTo: { type: "array", items: { type: "string" } }, tags: { type: "array", items: { type: "string" } }, notifyEmails: { type: "array", items: { type: "string" } }, webhookUrl: { type: "string" }, markSpam: { type: "boolean" } } }, stop_on_match: { type: "boolean" }, active: { type: "boolean" } } },
        RoutingRule: { allOf: [ref("RoutingRuleInput"), { type: "object", properties: { id: { type: "string" }, hit_count: { type: "integer" } } }] },
      },
    },
    "x-public-endpoints": { "POST /api/f/{formId}": "Public submission endpoint (no auth). Accepts urlencoded, multipart (files) and JSON." },
  };
}
