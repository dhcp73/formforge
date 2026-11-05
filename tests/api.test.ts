import { describe, it, expect } from "vitest";
import { workspace, form, apiKey, submit, call } from "./helpers";
import { createApiKey, listApiKeys, revokeApiKey, rotateApiKey, verifyApiKey } from "@/lib/apikeys";
import { getDb } from "@/lib/db";
import { sha256 } from "@/lib/ids";
import * as Forms from "@/app/api/v1/forms/route";
import * as FormOne from "@/app/api/v1/forms/[formId]/route";
import * as FormSubs from "@/app/api/v1/forms/[formId]/submissions/route";
import * as Export from "@/app/api/v1/forms/[formId]/export/route";
import * as SubOne from "@/app/api/v1/submissions/[submissionId]/route";
import * as Me from "@/app/api/v1/me/route";
import * as OpenApi from "@/app/api/v1/openapi.json/route";
import * as Rules from "@/app/api/v1/routing/rules/route";
import * as Stats from "@/app/api/v1/stats/route";

const { ws } = workspace("Api");
const key = apiKey(ws);

describe("API keys", () => {
  it("stores only a SHA-256 hash and a display prefix", () => {
    const { key: k, record } = createApiKey(ws, "ci", ["forms:read"]);
    expect(k).toMatch(/^ff_live_[A-Za-z0-9]{32}$/);
    expect(record.prefix).toBe(k.slice(0, 14));
    const row = getDb().prepare("SELECT * FROM api_keys WHERE id = ?").get(record.id) as Record<string, string>;
    expect(row.key_hash).toBe(sha256(k));
    expect(JSON.stringify(row)).not.toContain(k);
  });
  it("verifies, tracks last-used, revokes and rotates", () => {
    const { key: k, record } = createApiKey(ws, "rot", ["forms:read", "submissions:read"]);
    expect(verifyApiKey(k)?.workspaceId).toBe(ws);
    expect(listApiKeys(ws).find((x) => x.id === record.id)?.lastUsedAt).toBeTruthy();
    const rotated = rotateApiKey(ws, record.id);
    expect(verifyApiKey(k)).toBeNull();
    expect(verifyApiKey(rotated.key)?.scopes).toEqual(["forms:read", "submissions:read"]);
    expect(revokeApiKey(ws, rotated.record.id)).toBe(true);
    expect(verifyApiKey(rotated.key)).toBeNull();
    expect(verifyApiKey("ff_live_nope")).toBeNull();
  });
  it("rejects expired keys and empty scopes", () => {
    const { key: k } = createApiKey(ws, "old", ["forms:read"], undefined, new Date(Date.now() - 1000).toISOString());
    expect(verifyApiKey(k)).toBeNull();
    expect(() => createApiKey(ws, "none", ["bogus" as never])).toThrow(/scope/);
  });
});

describe("REST /api/v1", () => {
  it("401 without key, 403 on missing scope", async () => {
    const r = await call(Forms.GET, "/api/v1/forms");
    expect(r.status).toBe(401);
    expect(r.json.error.code).toBe("unauthorized");
    const ro = createApiKey(ws, "ro", ["submissions:read"]).key;
    const f = await call(Forms.GET, "/api/v1/forms", { key: ro });
    expect(f.status).toBe(403);
    expect(f.json.error.code).toBe("insufficient_scope");
    // x-api-key header also works
    const x = await call(Me.GET, "/api/v1/me", { headers: { "x-api-key": key } });
    expect(x.status).toBe(200);
    expect(x.json.workspace.id).toBe(ws);
  });

  it("form CRUD + validation errors", async () => {
    const created = await call(Forms.POST, "/api/v1/forms", { method: "POST", key, body: JSON.stringify({ name: "API form", settings: { honeypotField: "_hp", rateLimitPerMinute: 5 } }) });
    expect(created.status).toBe(201);
    expect(created.json.endpoint).toBe(`http://formforge.test/api/f/${created.json.id}`);
    expect(created.json.settings.rateLimitPerMinute).toBe(5);
    const id = created.json.id as string;
    const patched = await call(FormOne.PATCH, `/api/v1/forms/${id}`, { method: "PATCH", key, params: { formId: id }, body: JSON.stringify({ name: "Renamed", settings: { maxSubmissions: 10 } }) });
    expect(patched.status).toBe(200);
    expect(patched.json.name).toBe("Renamed");
    expect(patched.json.settings.rateLimitPerMinute).toBe(5);
    const list = await call(Forms.GET, "/api/v1/forms", { key });
    expect(list.json.data.some((f: { id: string }) => f.id === id)).toBe(true);
    const bad = await call(Forms.POST, "/api/v1/forms", { method: "POST", key, body: "[]" });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("invalid_json");
    const del = await call(FormOne.DELETE, `/api/v1/forms/${id}`, { method: "DELETE", key, params: { formId: id } });
    expect(del.status).toBe(200);
    expect((await call(FormOne.GET, `/api/v1/forms/${id}`, { key, params: { formId: id } })).status).toBe(404);
  });

  it("is tenant-isolated", async () => {
    const other = workspace("Other");
    const theirs = form(other.ws);
    expect((await call(FormOne.GET, `/api/v1/forms/${theirs.id}`, { key, params: { formId: theirs.id } })).status).toBe(404);
    const s = await submit(theirs.id, { email: "x@y.example" });
    expect((await call(SubOne.GET, `/api/v1/submissions/${s.json.id}`, { key, params: { submissionId: s.json.id as string } })).status).toBe(404);
  });

  it("lists, filters, paginates, updates, exports and deletes submissions", async () => {
    const f = form(ws);
    for (let i = 0; i < 5; i++) await submit(f.id, { email: `p${i}@example.org`, message: i === 2 ? "needle here" : "hello" });
    await submit(f.id, { email: "s@example.org", _gotcha: "bot" });
    const page = await call(FormSubs.GET, `/api/v1/forms/${f.id}/submissions?limit=2&page=2`, { key, params: { formId: f.id } });
    expect(page.status).toBe(200);
    expect(page.json.data).toHaveLength(2);
    expect(page.json.pagination).toMatchObject({ page: 2, limit: 2, total: 5, total_pages: 3 });
    const q = await call(FormSubs.GET, `/api/v1/forms/${f.id}/submissions?q=needle`, { key, params: { formId: f.id } });
    expect(q.json.data).toHaveLength(1);
    const spam = await call(FormSubs.GET, `/api/v1/forms/${f.id}/submissions?spam=true`, { key, params: { formId: f.id } });
    expect(spam.json.data).toHaveLength(1);
    const id = q.json.data[0].id as string;
    const upd = await call(SubOne.PATCH, `/api/v1/submissions/${id}`, { method: "PATCH", key, params: { submissionId: id }, body: JSON.stringify({ status: "read", owner: "ae@acme.example", tags: ["vip"] }) });
    expect(upd.json).toMatchObject({ status: "read", owner: "ae@acme.example", tags: ["vip"] });
    const csv = await call(Export.GET, `/api/v1/forms/${f.id}/export`, { key, params: { formId: f.id } });
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(String(csv.json).split("\n").length).toBeGreaterThanOrEqual(6);
    const js = await call(Export.GET, `/api/v1/forms/${f.id}/export?format=json&spam=all`, { key, params: { formId: f.id } });
    expect(js.json).toHaveLength(6);
    expect((await call(SubOne.DELETE, `/api/v1/submissions/${id}`, { method: "DELETE", key, params: { submissionId: id } })).json).toEqual({ deleted: true, id });
  });

  it("routing rules: zod validation → 422 with details", async () => {
    const bad = await call(Rules.POST, "/api/v1/routing/rules", { method: "POST", key, body: JSON.stringify({ name: "", conditions: [{ field: "x", op: "nope" }] }) });
    expect(bad.status).toBe(422);
    expect(bad.json.error.code).toBe("validation_failed");
    expect(Array.isArray(bad.json.error.details)).toBe(true);
    const ok = await call(Rules.POST, "/api/v1/routing/rules", { method: "POST", key, body: JSON.stringify({ name: "Enterprise", conditions: [{ field: "company.employees", op: "gte", value: 200 }], actions: { assign_to: ["ae@acme.example"] } }) });
    expect(ok.status).toBe(201);
  });

  it("stats and OpenAPI document", async () => {
    expect((await call(Stats.GET, "/api/v1/stats", { key })).status).toBe(200);
    const spec = await call(OpenApi.GET as never, "/api/v1/openapi.json");
    expect(spec.status).toBe(200);
    expect(spec.json.openapi).toMatch(/^3\./);
    const paths = Object.keys(spec.json.paths);
    expect(paths).toEqual(expect.arrayContaining(["/forms", "/forms/{formId}", "/submissions/{submissionId}", "/submissions/{submissionId}/enrich", "/research", "/status"]));
    expect(spec.json.components.securitySchemes).toBeTruthy();
  });
});
