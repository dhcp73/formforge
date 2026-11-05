/**
 * Full API endpoint audit.
 * Hits every route with: valid auth, missing auth, wrong-scope key, invalid body (where applicable).
 * Also verifies outbound webhook events fire with valid HMAC signatures to a local receiver.
 *
 * Usage: npm run test:api-audit
 * Writes reports/api-audit.md
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createUser } from "../src/lib/auth";
import { createForm } from "../src/lib/forms";
import { createApiKey } from "../src/lib/apikeys";
import { createWebhook, verifySignature, listDeliveries, attemptDelivery } from "../src/lib/webhooks";
import { createRule } from "../src/lib/routing";
import { SCOPES } from "../src/lib/types";
import { processSubmission } from "../src/lib/processing";
import { registerHandlers } from "../src/lib/worker";
import { drainJobs } from "../src/lib/jobs";
import { POST as formPost } from "../src/app/api/f/[formId]/route";

process.env.FORMFORGE_DNS ??= "off";
process.env.FORMFORGE_RETRY_SCALE ??= "0.001";
registerHandlers();

type CaseResult = { case: string; status: number; ok: boolean; detail?: string };
type Row = { endpoint: string; method: string; cases: CaseResult[]; result: "pass" | "fail" };

const rows: Row[] = [];
const failures: string[] = [];

async function call(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (req: Request, ctx: any) => Promise<Response> | Response,
  method: string,
  url: string,
  opts: { key?: string; body?: unknown; params?: Record<string, string>; headers?: Record<string, string> } = {},
) {
  const headers = new Headers(opts.headers);
  if (opts.key) headers.set("authorization", `Bearer ${opts.key}`);
  if (opts.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await handler(
    new Request(`http://formforge.test${url}`, {
      method,
      headers,
      body: opts.body !== undefined ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)) : undefined,
    }),
    { params: Promise.resolve(opts.params ?? {}) },
  );
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers, text };
}

function record(endpoint: string, method: string, cases: CaseResult[]) {
  const result = cases.every((c) => c.ok) ? "pass" : "fail";
  rows.push({ endpoint, method, cases, result });
  if (result === "fail") {
    for (const c of cases.filter((x) => !x.ok)) failures.push(`${method} ${endpoint} · ${c.case}: status=${c.status} ${c.detail ?? ""}`);
  }
}

async function load(mod: string) {
  return import(pathToFile(mod));
}
function pathToFile(p: string) {
  return new URL(`../src/app/api/${p}/route.ts`, import.meta.url).href;
}

async function main() {
  const { workspaceId: ws } = createUser({ email: `audit-${Date.now()}@example.com`, name: "Audit", password: "password123", workspaceName: "Audit WS" });
  const fullKey = createApiKey(ws, "full", [...SCOPES]).key;
  const readFormsKey = createApiKey(ws, "ro-forms", ["forms:read"]).key;
  const form = createForm(ws, { name: "Audit form", settings: { schemaMode: "off", notifyEmails: [] } });

  // ---- Public / health ----
  {
    const Health = await load("health");
    const r = Health.GET();
    record("/api/health", "GET", [{ case: "public", status: r.status, ok: r.status === 200 }]);
  }
  {
    const Ready = await load("health/ready");
    const r = Ready.GET();
    record("/api/health/ready", "GET", [{ case: "public", status: r.status, ok: r.status === 200 || r.status === 503 }]);
  }

  // ---- Ingest ----
  {
    const cases: CaseResult[] = [];
    const ok = await call(formPost, "POST", `/api/f/${form.id}`, { body: { email: "lead@acme.test", message: "hi" }, headers: { accept: "application/json" }, params: { formId: form.id } });
    cases.push({ case: "valid body", status: ok.status, ok: ok.status === 200 && !!(ok.json as { id?: string }).id });
    const empty = await call(formPost, "POST", `/api/f/${form.id}`, { body: {}, headers: { accept: "application/json" }, params: { formId: form.id } });
    cases.push({ case: "empty body", status: empty.status, ok: empty.status === 422 });
    const missing = await call(formPost, "POST", `/api/f/form_missing`, { body: { email: "a@b.c" }, headers: { accept: "application/json" }, params: { formId: "form_missing" } });
    cases.push({ case: "missing form", status: missing.status, ok: missing.status === 404 });
    const opt = await call(formPost as never, "OPTIONS", `/api/f/${form.id}`, { params: { formId: form.id } });
    // OPTIONS is separate export
    const F = await load("f/[formId]");
    const opt2 = await F.OPTIONS(new Request(`http://formforge.test/api/f/${form.id}`, { method: "OPTIONS" }));
    cases.push({ case: "OPTIONS cors", status: opt2.status, ok: opt2.status === 204 });
    void opt;
    record("/api/f/{formId}", "POST", cases);
  }

  // ---- OpenAPI (public) ----
  {
    const Open = await load("v1/openapi.json");
    const r = Open.GET(new Request("http://formforge.test/api/v1/openapi.json"));
    record("/api/v1/openapi.json", "GET", [{ case: "public", status: r.status, ok: r.status === 200 }]);
  }

  // Helper to audit a typical apiRoute endpoint
  async function auditApi(
    endpoint: string,
    method: string,
    modPath: string,
    exportName: string,
    opts: {
      scopeNeeded?: string;
      params?: Record<string, string>;
      body?: unknown;
      invalidBody?: unknown;
      expectValid?: (r: { status: number; json: unknown }) => boolean;
      url?: string;
    } = {},
  ) {
    const mod = await load(modPath);
    const handler = mod[exportName] as (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
    const url = opts.url ?? endpoint.replace("{formId}", opts.params?.formId ?? "").replace("{submissionId}", opts.params?.submissionId ?? "").replace("{webhookId}", opts.params?.webhookId ?? "").replace("{ruleId}", opts.params?.ruleId ?? "").replace("{scheduleId}", opts.params?.scheduleId ?? "").replace("{taskId}", opts.params?.taskId ?? "").replace("{index}", opts.params?.index ?? "");
    const cases: CaseResult[] = [];
    const noAuth = await call(handler, method, url, { params: opts.params });
    cases.push({ case: "missing auth", status: noAuth.status, ok: noAuth.status === 401 });
    if (opts.scopeNeeded) {
      const wrong = await call(handler, method, url, { key: readFormsKey, params: opts.params, body: opts.body });
      // readFormsKey only has forms:read — wrong for anything else
      const expect403 = opts.scopeNeeded !== "forms:read";
      cases.push({ case: "wrong scope", status: wrong.status, ok: expect403 ? wrong.status === 403 : wrong.status < 500 });
    }
    if (opts.invalidBody !== undefined) {
      const bad = await call(handler, method, url, { key: fullKey, params: opts.params, body: opts.invalidBody });
      cases.push({ case: "invalid body", status: bad.status, ok: bad.status === 400 || bad.status === 422 });
    }
    const valid = await call(handler, method, url, { key: fullKey, params: opts.params, body: opts.body });
    const okValid = opts.expectValid ? opts.expectValid(valid) : valid.status < 500;
    cases.push({ case: "valid auth", status: valid.status, ok: okValid, detail: okValid ? undefined : JSON.stringify(valid.json).slice(0, 200) });
    record(endpoint, method, cases);
    return valid;
  }

  await auditApi("/api/v1/me", "GET", "v1/me", "GET", { expectValid: (r) => r.status === 200 });
  await auditApi("/api/v1/forms", "GET", "v1/forms", "GET", { scopeNeeded: "forms:read", expectValid: (r) => r.status === 200 });
  const created = await auditApi("/api/v1/forms", "POST", "v1/forms", "POST", {
    scopeNeeded: "forms:write", body: { name: "Created via audit" }, invalidBody: "[]",
    expectValid: (r) => r.status === 201 || r.status === 200,
  });
  const newFormId = (created.json as { id?: string })?.id ?? form.id;

  await auditApi("/api/v1/forms/{formId}", "GET", "v1/forms/[formId]", "GET", {
    scopeNeeded: "forms:read", params: { formId: newFormId }, url: `/api/v1/forms/${newFormId}`,
    expectValid: (r) => r.status === 200,
  });
  await auditApi("/api/v1/forms/{formId}", "PATCH", "v1/forms/[formId]", "PATCH", {
    scopeNeeded: "forms:write", params: { formId: newFormId }, url: `/api/v1/forms/${newFormId}`,
    body: { name: "Renamed audit" }, invalidBody: "[]",
    expectValid: (r) => r.status === 200,
  });

  await auditApi("/api/v1/forms/{formId}/submissions", "GET", "v1/forms/[formId]/submissions", "GET", {
    scopeNeeded: "submissions:read", params: { formId: form.id }, url: `/api/v1/forms/${form.id}/submissions`,
    expectValid: (r) => r.status === 200,
  });
  await auditApi("/api/v1/submissions", "GET", "v1/submissions", "GET", {
    scopeNeeded: "submissions:read", expectValid: (r) => r.status === 200,
  });
  await auditApi("/api/v1/stats", "GET", "v1/stats", "GET", {
    scopeNeeded: "submissions:read", expectValid: (r) => r.status === 200,
  });
  await auditApi("/api/v1/status", "GET", "v1/status", "GET", { expectValid: (r) => r.status === 200 });
  await auditApi("/api/v1/enrichment/config", "GET", "v1/enrichment/config", "GET", {
    scopeNeeded: "forms:read", expectValid: (r) => r.status === 200,
  });

  // Routing rules
  await auditApi("/api/v1/routing/rules", "GET", "v1/routing/rules", "GET", {
    scopeNeeded: "automations:read", expectValid: (r) => r.status === 200,
  });
  const ruleRes = await auditApi("/api/v1/routing/rules", "POST", "v1/routing/rules", "POST", {
    scopeNeeded: "automations:write",
    body: { name: "Audit rule", conditions: [{ field: "company.employees", op: "gte", value: 1 }], actions: { assignTo: ["ava@acme.test"] } },
    invalidBody: { name: "x", conditions: [] },
    expectValid: (r) => r.status === 201 || r.status === 200,
  });
  const ruleId = (ruleRes.json as { id?: string })?.id;

  if (ruleId) {
    await auditApi("/api/v1/routing/rules/{ruleId}", "PATCH", "v1/routing/rules/[ruleId]", "PATCH", {
      scopeNeeded: "automations:write", params: { ruleId }, url: `/api/v1/routing/rules/${ruleId}`,
      body: { name: "Audit rule 2" }, expectValid: (r) => r.status === 200,
    });
  }

  // Webhooks
  const whCreate = await auditApi("/api/v1/forms/{formId}/webhooks", "POST", "v1/forms/[formId]/webhooks", "POST", {
    scopeNeeded: "automations:write", params: { formId: form.id }, url: `/api/v1/forms/${form.id}/webhooks`,
    body: { url: "http://127.0.0.1:9/sink", events: ["submission.created", "submission.enriched", "submission.routed", "enrichment.completed", "routing.assigned"] },
    invalidBody: { url: "not-a-url" },
    expectValid: (r) => r.status === 201 || r.status === 200,
  });
  const webhookId = (whCreate.json as { id?: string })?.id;
  await auditApi("/api/v1/forms/{formId}/webhooks", "GET", "v1/forms/[formId]/webhooks", "GET", {
    scopeNeeded: "automations:read", params: { formId: form.id }, url: `/api/v1/forms/${form.id}/webhooks`,
    expectValid: (r) => r.status === 200,
  });
  if (webhookId) {
    await auditApi("/api/v1/webhooks/{webhookId}", "PATCH", "v1/webhooks/[webhookId]", "PATCH", {
      scopeNeeded: "automations:write", params: { webhookId }, url: `/api/v1/webhooks/${webhookId}`,
      body: { url: "http://127.0.0.1:9/sink2", events: ["submission.created"] },
      expectValid: (r) => r.status === 200,
    });
    await auditApi("/api/v1/webhooks/{webhookId}/deliveries", "GET", "v1/webhooks/[webhookId]/deliveries", "GET", {
      scopeNeeded: "automations:read", params: { webhookId }, url: `/api/v1/webhooks/${webhookId}/deliveries`,
      expectValid: (r) => r.status === 200,
    });
    await auditApi("/api/v1/webhooks/{webhookId}/test", "POST", "v1/webhooks/[webhookId]/test", "POST", {
      scopeNeeded: "automations:write", params: { webhookId }, url: `/api/v1/webhooks/${webhookId}/test`,
      expectValid: (r) => r.status < 500,
    });
  }

  // Schedules
  const sch = await auditApi("/api/v1/forms/{formId}/schedules", "POST", "v1/forms/[formId]/schedules", "POST", {
    scopeNeeded: "automations:write", params: { formId: form.id }, url: `/api/v1/forms/${form.id}/schedules`,
    body: { name: "Daily digest", kind: "digest", cron: "0 9 * * *", timezone: "UTC", config: { recipients: ["ops@acme.test"] } },
    invalidBody: { name: "x", kind: "nope", cron: "bad" },
    expectValid: (r) => r.status === 201 || r.status === 200 || r.status === 422,
  });
  const scheduleId = (sch.json as { id?: string })?.id;
  await auditApi("/api/v1/forms/{formId}/schedules", "GET", "v1/forms/[formId]/schedules", "GET", {
    scopeNeeded: "automations:read", params: { formId: form.id }, url: `/api/v1/forms/${form.id}/schedules`,
    expectValid: (r) => r.status === 200,
  });
  if (scheduleId) {
    await auditApi("/api/v1/schedules/{scheduleId}", "PATCH", "v1/schedules/[scheduleId]", "PATCH", {
      scopeNeeded: "automations:write", params: { scheduleId }, url: `/api/v1/schedules/${scheduleId}`,
      body: { name: "Digest 2" }, expectValid: (r) => r.status === 200,
    });
    await auditApi("/api/v1/schedules/{scheduleId}/run", "POST", "v1/schedules/[scheduleId]/run", "POST", {
      scopeNeeded: "automations:write", params: { scheduleId }, url: `/api/v1/schedules/${scheduleId}/run`,
      expectValid: (r) => r.status < 500,
    });
  }

  // Export
  await auditApi("/api/v1/forms/{formId}/export", "GET", "v1/forms/[formId]/export", "GET", {
    scopeNeeded: "submissions:read", params: { formId: form.id }, url: `/api/v1/forms/${form.id}/export?format=json`,
    expectValid: (r) => r.status === 200,
  });

  // Research (may 400 without provider)
  await auditApi("/api/v1/research", "POST", "v1/research", "POST", {
    scopeNeeded: "submissions:write", body: { domain: "stripe.com" }, invalidBody: {},
    expectValid: (r) => r.status < 500,
  });

  // Booking slots (public)
  {
    const Slots = await load("v1/booking/slots");
    const cases: CaseResult[] = [];
    const missing = await call(Slots.GET, "GET", "/api/v1/booking/slots");
    cases.push({ case: "missing submissionId", status: missing.status, ok: missing.status === 400 });
    const sub = await call(formPost, "POST", `/api/f/${form.id}`, { body: { email: "book@acme.test" }, headers: { accept: "application/json" }, params: { formId: form.id } });
    const sid = (sub.json as { id?: string }).id!;
    const ok = await call(Slots.GET, "GET", `/api/v1/booking/slots?submissionId=${sid}`);
    cases.push({ case: "valid submissionId", status: ok.status, ok: ok.status === 200 });
    record("/api/v1/booking/slots", "GET", cases);
  }

  // MCP
  {
    const Mcp = await load("mcp");
    const cases: CaseResult[] = [];
    const noAuth = await call(Mcp.POST, "POST", "/api/mcp", { body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    cases.push({ case: "missing auth", status: noAuth.status, ok: noAuth.status === 401 || noAuth.status === 400 || noAuth.status === 406 });
    const withKey = await call(Mcp.POST, "POST", "/api/mcp", { key: fullKey, body: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "audit", version: "1" } } }, headers: { accept: "application/json, text/event-stream", "content-type": "application/json" } });
    cases.push({ case: "valid auth initialize", status: withKey.status, ok: withKey.status < 500 });
    record("/api/mcp", "POST", cases);
  }

  // Clay / Valyu callbacks (signature failures)
  {
    const Clay = await load("integrations/clay/callback");
    const r = await call(Clay.POST, "POST", "/api/integrations/clay/callback", { body: { submissionId: "x" } });
    record("/api/integrations/clay/callback", "POST", [{ case: "missing/invalid secret", status: r.status, ok: [400, 401, 403, 404].includes(r.status) }]);
  }
  {
    const Valyu = await load("integrations/valyu/webhook");
    const r = await call(Valyu.POST, "POST", "/api/integrations/valyu/webhook", { body: {} });
    record("/api/integrations/valyu/webhook", "POST", [{ case: "missing/invalid signature", status: r.status, ok: [400, 401, 403, 404].includes(r.status) }]);
  }

  // ---- Webhook event delivery with HMAC ----
  {
    const received: { event: string; body: string; sig: string }[] = [];
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        received.push({ event: String(req.headers["x-formforge-event"] ?? ""), body, sig: String(req.headers["x-formforge-signature"] ?? "") });
        res.writeHead(200); res.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const sink = `http://127.0.0.1:${port}/hook`;

    createRule(ws, {
      name: "Route for audit",
      conditions: [{ field: "email", op: "contains", value: "@" }],
      actions: { assignTo: ["ava@acme.test"], bookingUrl: "https://cal.com/ava/demo" },
      match: "any",
    });
    const hook = createWebhook(ws, form.id, {
      url: sink,
      events: ["submission.created", "submission.enriched", "submission.routed", "enrichment.completed", "routing.assigned"],
    });

    const sub = await call(formPost, "POST", `/api/f/${form.id}`, {
      body: { email: "hmac@stripe.com", company: "Stripe", message: "Enterprise" },
      headers: { accept: "application/json" }, params: { formId: form.id },
    });
    const sid = (sub.json as { id: string }).id;
    await processSubmission(sid);
    await drainJobs(50);
    // Deliver any remaining pending
    for (const d of listDeliveries(ws, { webhookId: hook.id, limit: 50 })) {
      if (d.status === "pending" || d.status === "retrying") await attemptDelivery(d.id);
    }

    const events = new Set(received.map((r) => r.event));
    const cases: CaseResult[] = [];
    for (const ev of ["submission.created", "submission.enriched", "submission.routed", "enrichment.completed", "routing.assigned"]) {
      cases.push({ case: `event ${ev} delivered`, status: events.has(ev) ? 200 : 0, ok: events.has(ev), detail: events.has(ev) ? undefined : `got [${[...events].join(", ")}]` });
    }
    let sigOk = received.length > 0;
    for (const r of received) {
      if (!verifySignature(hook.secret, r.body, r.sig)) { sigOk = false; break; }
    }
    cases.push({ case: "HMAC signatures valid", status: sigOk ? 200 : 0, ok: sigOk, detail: `checked ${received.length} deliveries` });
    record("webhook.events → local receiver", "POST", cases);

    server.close();
  }

  // Delete cleanup endpoints
  if (ruleId) {
    await auditApi("/api/v1/routing/rules/{ruleId}", "DELETE", "v1/routing/rules/[ruleId]", "DELETE", {
      scopeNeeded: "automations:write", params: { ruleId }, url: `/api/v1/routing/rules/${ruleId}`,
      expectValid: (r) => r.status === 200,
    });
  }
  if (scheduleId) {
    await auditApi("/api/v1/schedules/{scheduleId}", "DELETE", "v1/schedules/[scheduleId]", "DELETE", {
      scopeNeeded: "automations:write", params: { scheduleId }, url: `/api/v1/schedules/${scheduleId}`,
      expectValid: (r) => r.status === 200,
    });
  }
  if (webhookId) {
    await auditApi("/api/v1/webhooks/{webhookId}", "DELETE", "v1/webhooks/[webhookId]", "DELETE", {
      scopeNeeded: "automations:write", params: { webhookId }, url: `/api/v1/webhooks/${webhookId}`,
      expectValid: (r) => r.status === 200,
    });
  }
  await auditApi("/api/v1/forms/{formId}", "DELETE", "v1/forms/[formId]", "DELETE", {
    scopeNeeded: "forms:write", params: { formId: newFormId }, url: `/api/v1/forms/${newFormId}`,
    expectValid: (r) => r.status === 200,
  });

  // Write report
  const outDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const pass = rows.filter((r) => r.result === "pass").length;
  const fail = rows.filter((r) => r.result === "fail").length;
  const lines = [
    `# API audit report`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `**Summary:** ${pass} passed · ${fail} failed · ${rows.length} endpoints/groups`,
    ``,
    `| Endpoint | Method | Cases | Result |`,
    `| --- | --- | --- | --- |`,
    ...rows.map((r) => {
      const cases = r.cases.map((c) => `${c.ok ? "✓" : "✗"} ${c.case} (${c.status})`).join("<br>");
      return `| \`${r.endpoint}\` | ${r.method} | ${cases} | **${r.result}** |`;
    }),
    ``,
  ];
  if (failures.length) {
    lines.push(`## Failures`, ``, ...failures.map((f) => `- ${f}`), ``);
  }
  const md = lines.join("\n");
  fs.writeFileSync(path.join(outDir, "api-audit.md"), md);
  console.log(md);
  console.log(`\nWrote reports/api-audit.md (${pass} pass / ${fail} fail)`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
