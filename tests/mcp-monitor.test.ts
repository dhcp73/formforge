import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { workspace, form, submit, apiKey, call } from "./helpers";
import { createMcpServer, MCP_TOOLS } from "@/lib/mcp/server";
import { localBackend } from "@/lib/mcp/local";
import * as McpRoute from "@/app/api/mcp/route";
import * as Health from "@/app/api/health/route";
import * as Ready from "@/app/api/health/ready/route";
import * as V1Status from "@/app/api/v1/status/route";
import { recordResults, runProbes, overallStatus, statusSummary, FAILURES_TO_OPEN, type ProbeResult } from "@/lib/monitor";
import { kvSet } from "@/lib/kv";
import { now, getDb } from "@/lib/db";
import { saveProvider } from "@/lib/integrations/store";

const { ws } = workspace("Mcp");
async function client(scopes: Parameters<typeof localBackend>[1] = "all") {
  const server = createMcpServer(localBackend(ws, scopes));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const c = new Client({ name: "test", version: "1.0.0" });
  await c.connect(b);
  return c;
}
const text = (r: unknown) => (r as { content: { text: string }[] }).content[0].text;

describe("MCP server", () => {
  it("lists all tools with schemas", async () => {
    const c = await client();
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...MCP_TOOLS].sort());
    expect(tools.find((t) => t.name === "research_company")!.inputSchema.properties).toHaveProperty("mode");
  });
  it("create_form → list_forms → search_submissions → get_submission → enrich_submission", async () => {
    const c = await client();
    const created = JSON.parse(text(await c.callTool({ name: "create_form", arguments: { name: "From MCP", notify_emails: ["me@acme.example"] } })));
    expect(created.endpoint).toContain(`/api/f/${created.id}`);
    expect(created.settings.notifyEmails).toEqual(["me@acme.example"]);
    const forms = JSON.parse(text(await c.callTool({ name: "list_forms", arguments: {} })));
    expect(forms.data.some((f: { id: string }) => f.id === created.id)).toBe(true);
    const s = await submit(created.id, { email: "mcp@monzo.com", message: "unique-mcp-needle" });
    const found = JSON.parse(text(await c.callTool({ name: "search_submissions", arguments: { query: "unique-mcp-needle" } })));
    expect(found.data[0].id).toBe(s.json.id);
    const one = JSON.parse(text(await c.callTool({ name: "get_submission", arguments: { submission_id: s.json.id } })));
    expect(one.data.email).toBe("mcp@monzo.com");
    const enriched = JSON.parse(text(await c.callTool({ name: "enrich_submission", arguments: { submission_id: s.json.id } })));
    expect(enriched.enrichment.company.name).toBe("Monzo");
    const stats = JSON.parse(text(await c.callTool({ name: "get_stats", arguments: {} })));
    expect(stats).toBeTruthy();
  });
  it("returns tool errors (not crashes) for missing resources and disabled providers", async () => {
    const c = await client();
    const r = await c.callTool({ name: "get_form", arguments: { form_id: "frm_nope" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/not found/i);
    const v = await c.callTool({ name: "research_company", arguments: { domain: "stripe.com" } });
    expect(v.isError).toBe(true);
    expect(text(v)).toMatch(/Valyu is not configured/);
  });
  it("enforces API-key scopes per tool", async () => {
    const c = await client(["forms:read"]);
    expect((await c.callTool({ name: "list_forms", arguments: {} })).isError).toBeFalsy();
    const denied = await c.callTool({ name: "create_form", arguments: { name: "nope" } });
    expect(denied.isError).toBe(true);
    expect(text(denied)).toMatch(/forms:write/);
  });
  it("HTTP transport /api/mcp requires a key and serves JSON-RPC", async () => {
    expect((await call(McpRoute.POST, "/api/mcp", { method: "POST", body: "{}" })).status).toBe(401);
    const key = apiKey(ws);
    form(ws, {}, "Visible via HTTP");
    const r = await call(McpRoute.POST, "/api/mcp", { method: "POST", key, headers: { accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_forms", arguments: {} } }) });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.json)).toContain("Visible via HTTP");
  });
});

const res = (component: string, status: ProbeResult["status"]): ProbeResult => ({ component, status, latencyMs: 5, message: status });

describe("monitor", () => {
  it("overall status precedence", () => {
    expect(overallStatus(["ok", "ok"])).toBe("ok");
    expect(overallStatus(["ok", "degraded"])).toBe("degraded");
    expect(overallStatus(["degraded", "down"])).toBe("down");
  });
  it(`opens an incident after ${FAILURES_TO_OPEN} consecutive failures and resolves on recovery`, async () => {
    expect(await recordResults([res("email", "down")])).toEqual([]);
    expect(await recordResults([res("email", "down")])).toEqual([{ component: "email", kind: "opened" }]);
    expect(await recordResults([res("email", "down")])).toEqual([]);
    const open = statusSummary().incidents.filter((i) => i.component === "email" && i.status === "open");
    expect(open).toHaveLength(1);
    expect(await recordResults([res("email", "ok")])).toEqual([{ component: "email", kind: "resolved" }]);
    const inc = statusSummary().incidents.find((i) => i.component === "email")!;
    expect(inc.status).toBe("resolved");
    expect(inc.resolved_at).toBeTruthy();
  });
  it("a single blip does not open an incident; uptime is computed", async () => {
    await recordResults([res("rest_api", "ok")]);
    await recordResults([res("rest_api", "down")]);
    await recordResults([res("rest_api", "ok")]);
    const c = statusSummary().components.find((x) => x.id === "rest_api")!;
    expect(statusSummary().incidents.some((i) => i.component === "rest_api")).toBe(false);
    expect(c.uptime24).toBeCloseTo(66.67, 1);
    expect(c.status).toBe("ok");
  });
  it("runs in-process probes; keyless providers report disabled; enabled-without-key stays disabled", async () => {
    kvSet("worker_heartbeat", now());
    kvSet("scheduler_heartbeat", now());
    const { ws: w2 } = workspace("Probe");
    saveProvider(w2, "apollo", { enabled: true }); // row enabled but no key
    const results = await runProbes({ http: false });
    const by = Object.fromEntries(results.map((r) => [r.component, r]));
    for (const c of ["database", "storage", "queue", "scheduler", "email", "routing", "enrichment_local"]) expect(by[c].status).toBe("ok");
    for (const p of ["provider_apollo", "provider_clay", "provider_valyu", "provider_openai", "provider_openrouter"]) expect(by[p].status).toBe("disabled");
    saveProvider(w2, "apollo", { config: { apiKey: "ap" } });
    expect((await runProbes({ http: false })).find((r) => r.component === "provider_apollo")!.status).toBe("ok");
  });
  it("queue probe goes down without a worker heartbeat", async () => {
    getDb().prepare("DELETE FROM kv WHERE key = 'worker_heartbeat'").run();
    expect((await runProbes({ http: false })).find((r) => r.component === "queue")!.status).toBe("down");
  });
  it("health endpoints", async () => {
    expect((await call(Health.GET as never, "/api/health")).json.status).toBe("ok");
    kvSet("worker_heartbeat", now());
    await recordResults((await runProbes({ http: false })));
    const ready = await call(Ready.GET as never, "/api/health/ready");
    expect(ready.status).toBe(200);
    expect(ready.json.components.provider_valyu.status).toBe("disabled");
    expect((await call(V1Status.GET, "/api/v1/status")).status).toBe(401);
    const st = await call(V1Status.GET, "/api/v1/status", { key: apiKey(ws) });
    expect(st.status).toBe(200);
  });
});
