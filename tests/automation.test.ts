import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { workspace, form, submit } from "./helpers";
import { createWebhook, listDeliveries, verifySignature } from "@/lib/webhooks";
import { createSchedule, runSchedule, dueSchedules, listExports, getSchedule } from "@/lib/schedules";
import { registerHandlers } from "@/lib/worker";
import { drainJobs, enqueueJob, registerJob, queueStats } from "@/lib/jobs";
import { listEmails } from "@/lib/email";
import { getDb, dataDir } from "@/lib/db";
import { getSubmission } from "@/lib/submissions";
import { createRule } from "@/lib/routing";

const received: { url: string; headers: Headers; body: string }[] = [];
let failTimes = 0;
const server = setupServer(
  http.post("https://hooks.test/ok", async ({ request }) => { received.push({ url: request.url, headers: request.headers, body: await request.text() }); return HttpResponse.json({ ok: true }); }),
  http.post("https://hooks.test/flaky", async ({ request }) => { received.push({ url: request.url, headers: request.headers, body: await request.text() }); return failTimes-- > 0 ? new HttpResponse("nope", { status: 503 }) : HttpResponse.json({ ok: true }); }),
  http.post("https://hooks.test/dead", () => new HttpResponse("gone", { status: 500 })),
  http.post("https://hooks.test/export", async ({ request }) => { received.push({ url: request.url, headers: request.headers, body: await request.text() }); return HttpResponse.json({ ok: true }); }),
);
beforeAll(() => { server.listen(); registerHandlers(); });
afterEach(() => { received.length = 0; });
afterAll(() => server.close());

const { ws } = workspace("Auto");
const drainAll = async () => { for (let i = 0; i < 20; i++) if (!(await drainJobs(50))) break; };

describe("job queue", () => {
  it("runs jobs, retries on error, then fails after 3 attempts", async () => {
    let calls = 0;
    registerJob("test.flaky", async () => { calls++; throw new Error("boom"); });
    const id = enqueueJob("test.flaky", {});
    await drainJobs();
    getDb().prepare("UPDATE jobs SET run_at = ? WHERE id = ?").run(new Date(0).toISOString(), id);
    await drainJobs();
    getDb().prepare("UPDATE jobs SET run_at = ? WHERE id = ?").run(new Date(0).toISOString(), id);
    await drainJobs();
    const row = getDb().prepare("SELECT status, attempts, last_error FROM jobs WHERE id = ?").get(id) as { status: string; attempts: number; last_error: string };
    expect(calls).toBe(3);
    expect(row).toMatchObject({ status: "failed", attempts: 3, last_error: "boom" });
    expect(queueStats()).toBeTruthy();
  });
});

describe("webhooks", () => {
  it("delivers signed payloads for submission events", async () => {
    const f = form(ws);
    const hook = createWebhook(ws, f.id, { url: "https://hooks.test/ok", events: ["submission.created"] });
    const r = await submit(f.id, { email: "hook@example.org" });
    await drainAll();
    expect(received).toHaveLength(1);
    const { headers, body } = received[0];
    expect(headers.get("x-formforge-event")).toBe("submission.created");
    expect(headers.get("x-formforge-attempt")).toBe("1");
    expect(verifySignature(hook.secret, body, headers.get("x-formforge-signature")!)).toBe(true);
    const payload = JSON.parse(body);
    expect(payload.submission.id).toBe(r.json.id);
    expect(payload.submission.data.email).toBe("hook@example.org");
    const log = listDeliveries(ws, { webhookId: hook.id });
    expect(log[0]).toMatchObject({ status: "success", attempts: 1, response_status: 200 });
  });

  it("retries with backoff and logs every attempt", async () => {
    failTimes = 2;
    const f = form(ws);
    const hook = createWebhook(ws, f.id, { url: "https://hooks.test/flaky", events: ["submission.created"] });
    await submit(f.id, { email: "flaky@example.org" });
    await drainAll();
    expect(received.map((r) => r.headers.get("x-formforge-attempt"))).toEqual(["1", "2", "3"]);
    expect(listDeliveries(ws, { webhookId: hook.id })[0]).toMatchObject({ status: "success", attempts: 3 });
  });

  it("gives up after max attempts", async () => {
    const f = form(ws);
    const hook = createWebhook(ws, f.id, { url: "https://hooks.test/dead", events: ["submission.created"] });
    await submit(f.id, { email: "dead@example.org" });
    await drainAll();
    expect(listDeliveries(ws, { webhookId: hook.id })[0]).toMatchObject({ status: "failed", attempts: 5, response_status: 500 });
  });

  it("skips spam unless includeSpam", async () => {
    const f = form(ws);
    createWebhook(ws, f.id, { url: "https://hooks.test/ok", events: ["submission.created"] });
    await submit(f.id, { email: "s@example.org", _gotcha: "x" });
    await drainAll();
    expect(received).toHaveLength(0);
  });

  it("rejects non-http URLs", () => {
    const f = form(ws);
    expect(() => createWebhook(ws, f.id, { url: "ftp://x", events: ["submission.created"] })).toThrow();
  });
});

describe("processing pipeline", () => {
  it("routes, emails and records activity", async () => {
    const f = form(ws, { notifyEmails: ["owner@acme.example"] });
    createRule(ws, { name: "UK leads", formId: f.id, conditions: [{ field: "geo.country", op: "eq", value: "GB" }], actions: { assignTo: ["uk@acme.example"], tags: ["uk"] } });
    const r = await submit(f.id, { email: "lead@monzo.com" }, { ip: "81.2.69.142" });
    await drainAll();
    const s = getSubmission(ws, r.json.id as string)!;
    expect(s.owner).toBe("uk@acme.example");
    expect(s.tags).toContain("uk");
    expect(s.enrichmentStatus).toBe("complete");
    expect(listEmails(ws).some((e) => e.to_addr === "owner@acme.example" || (e as unknown as { to: string }).to === "owner@acme.example")).toBe(true);
  });
});

describe("schedules", () => {
  it("digest emails recipients via outbox", async () => {
    const f = form(ws);
    await submit(f.id, { email: "d1@example.org" });
    const s = createSchedule(ws, f.id, { name: "Daily", kind: "digest", cron: "0 9 * * *", timezone: "Europe/London", config: { recipients: ["team@acme.example"] } });
    const res = await runSchedule(s.id);
    expect(res.status).toBe("success");
    expect(res.detail).toMatch(/1 recipient/);
    expect(getSchedule(ws, s.id)!.lastRunAt).toBeTruthy();
  });
  it("webhook export posts submissions", async () => {
    const f = form(ws);
    await submit(f.id, { email: "e1@example.org" });
    await submit(f.id, { email: "e2@example.org" });
    const s = createSchedule(ws, f.id, { name: "Push", kind: "webhook_export", cron: "*/15 * * * *", timezone: "UTC", config: { url: "https://hooks.test/export" } });
    expect((await runSchedule(s.id)).status).toBe("success");
    const body = JSON.parse(received[0].body);
    expect(body).toMatchObject({ event: "schedule.export", count: 2 });
  });
  it("CSV export writes a file and an exports row", async () => {
    const f = form(ws);
    await submit(f.id, { email: "c1@example.org", note: 'has "quotes", commas' });
    const s = createSchedule(ws, f.id, { name: "CSV", kind: "csv_export", cron: "0 * * * *", timezone: "UTC", config: {} });
    expect((await runSchedule(s.id)).status).toBe("success");
    const ex = listExports(ws, f.id)[0] as { filename: string; row_count?: number; rowCount?: number };
    const csv = fs.readFileSync(path.join(dataDir(), "exports", ex.filename), "utf8");
    expect(csv).toContain('"has ""quotes"", commas"');
  });
  it("due schedules are picked up by the ticker and advanced", () => {
    const f = form(ws);
    const s = createSchedule(ws, f.id, { name: "Due", kind: "csv_export", cron: "0 * * * *", timezone: "UTC", config: {} });
    getDb().prepare("UPDATE schedules SET next_run_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), s.id);
    expect(dueSchedules()).toContain(s.id);
    expect(new Date(getSchedule(ws, s.id)!.nextRunAt!).getTime()).toBeGreaterThan(Date.now());
    expect(dueSchedules()).not.toContain(s.id);
  });
  it("validates cron and kind-specific config", () => {
    const f = form(ws);
    expect(() => createSchedule(ws, f.id, { name: "x", kind: "digest", cron: "not a cron", timezone: "UTC", config: { recipients: ["a@b.co"] } })).toThrow();
    expect(() => createSchedule(ws, f.id, { name: "x", kind: "webhook_export", cron: "0 * * * *", timezone: "UTC", config: {} })).toThrow();
  });
});
