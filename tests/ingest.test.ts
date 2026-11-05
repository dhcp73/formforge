import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import { workspace, form, submit, resetRateLimits } from "./helpers";
import { getSubmission, listSubmissions } from "@/lib/submissions";
import { updateForm } from "@/lib/forms";
import { OPTIONS, GET } from "@/app/api/f/[formId]/route";

const { ws } = workspace();
beforeEach(() => resetRateLimits());

describe("form endpoint /api/f/{id}", () => {
  it("accepts JSON and returns JSON", async () => {
    const f = form(ws);
    const { status, json } = await submit(f.id, { name: "Ada", email: "ada@stripe.com", seats: "12" });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    const s = getSubmission(ws, json.id as string)!;
    expect(s.data).toMatchObject({ name: "Ada", email: "ada@stripe.com" });
    expect(s.fieldTypes.email).toBe("email");
    expect(s.fieldTypes.seats).toBe("number");
    // inline enrichment ran (offline)
    expect((s.enrichment.company as { name: string }).name).toBe("Stripe");
    expect(s.enrichment.attribution).toMatchObject({ "company.name": "offline" });
  });

  it("accepts urlencoded and redirects to the thank-you page (303)", async () => {
    const f = form(ws);
    const { res } = await submit(f.id, new URLSearchParams({ email: "bob@example.org", message: "hello" }), { json: false, headers: { "content-type": "application/x-www-form-urlencoded", referer: "https://site.example/contact" } });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/thanks?form=");
    expect(listSubmissions(ws, { formId: f.id }).total).toBe(1);
  });

  it("honours redirectUrl and per-submission _next", async () => {
    const f = form(ws, { redirectUrl: "https://acme.example/thanks" });
    const a = await submit(f.id, new URLSearchParams({ email: "x@acme.example" }), { json: false, headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(a.res.headers.get("location")).toBe("https://acme.example/thanks");
    const b = await submit(f.id, new URLSearchParams({ email: "y@acme.example", _next: "https://acme.example/other" }), { json: false, headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(b.res.headers.get("location")).toBe("https://acme.example/other");
    const stored = listSubmissions(ws, { formId: f.id }).data;
    expect(stored.every((s) => !("_next" in s.data))).toBe(true);
  });

  it("accepts multipart with files and stores them", async () => {
    const f = form(ws);
    const fd = new FormData();
    fd.set("email", "cv@example.org");
    fd.set("resume", new File([Buffer.from("%PDF-1.4 fake")], "resume.pdf", { type: "application/pdf" }));
    const { status, json } = await submit(f.id, fd);
    expect(status).toBe(200);
    const s = getSubmission(ws, json.id as string)!;
    expect(s.files).toHaveLength(1);
    expect(s.files[0]).toMatchObject({ name: "resume.pdf", type: "application/pdf", field: "resume" });
    expect(fs.existsSync(s.files[0].path)).toBe(true);
  });

  it("sends CORS headers and handles preflight", async () => {
    const f = form(ws);
    const pre = await OPTIONS(new Request(`http://formforge.test/api/f/${f.id}`, { method: "OPTIONS", headers: { origin: "https://site.example" } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBeTruthy();
    const { res } = await submit(f.id, { email: "c@site.example" }, { headers: { origin: "https://site.example" } });
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
    const get = await GET(new Request(`http://formforge.test/api/f/${f.id}`), { params: Promise.resolve({ formId: f.id }) });
    expect(get.status).toBe(405);
  });

  it("404s for unknown forms and 422s for empty submissions", async () => {
    expect((await submit("nope123456", { a: 1 })).status).toBe(404);
    const f = form(ws);
    const r = await submit(f.id, {});
    expect(r.status).toBe(422);
    expect(r.json.code).toBe("empty");
  });

  it("honeypot submissions are accepted but stored as spam", async () => {
    const f = form(ws);
    const r = await submit(f.id, { email: "bot@example.org", _gotcha: "http://spam" });
    expect(r.status).toBe(200);
    const s = getSubmission(ws, r.json.id as string)!;
    expect(s.isSpam).toBe(true);
    expect(s.spamScore).toBe(100);
    expect("_gotcha" in s.data).toBe(false);
  });

  it("rate-limits per IP", async () => {
    const f = form(ws, { rateLimitPerMinute: 2 });
    const ip = "9.9.9.9";
    expect((await submit(f.id, { m: "1" }, { ip })).status).toBe(200);
    expect((await submit(f.id, { m: "2" }, { ip })).status).toBe(200);
    const third = await submit(f.id, { m: "3" }, { ip });
    expect(third.status).toBe(429);
    expect(third.res.headers.get("retry-after")).toBe("60");
  });

  it("enforces allowed domains via Origin/Referer", async () => {
    const f = form(ws, { allowedDomains: ["acme.example", "*.acme.dev"] });
    expect((await submit(f.id, { a: "1" }, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await submit(f.id, { a: "1" }, { headers: { origin: "https://acme.example" } })).status).toBe(200);
    expect((await submit(f.id, { a: "1" }, { headers: { referer: "https://app.acme.dev/x" } })).status).toBe(200);
    expect((await submit(f.id, { a: "1" })).status).toBe(403);
  });

  it("flags or rejects spam according to spamAction", async () => {
    const spammy = { email: "x@mailinator.com", message: "BUY CHEAP VIAGRA CASINO http://a.example http://b.example http://c.example" };
    const flag = form(ws);
    const r1 = await submit(flag.id, spammy, { headers: { "user-agent": "python-requests/2.31" } });
    expect(r1.status).toBe(200);
    expect(r1.json.spam).toBe(true);
    const rej = form(ws, { spamAction: "reject" });
    const r2 = await submit(rej.id, spammy, { headers: { "user-agent": "python-requests/2.31" } });
    expect(r2.status).toBe(422);
    expect(r2.json.code).toBe("spam_rejected");
  });

  it("detects duplicates within the window", async () => {
    const f = form(ws);
    const body = { email: "dup@example.org", message: "same message" };
    const a = await submit(f.id, body);
    const b = await submit(f.id, body);
    expect(getSubmission(ws, a.json.id as string)!.spamReasons.join()).not.toMatch(/Duplicate/);
    expect(getSubmission(ws, b.json.id as string)!.spamReasons.join()).toMatch(/Duplicate/);
  });
});

describe("availability windows & caps", () => {
  it("rejects before opensAt and after closesAt", async () => {
    const future = form(ws, { opensAt: new Date(Date.now() + 3600e3).toISOString() });
    const r = await submit(future.id, { a: "1" });
    expect(r.status).toBe(410);
    expect(r.json.code).toBe("not_open_yet");
    const past = form(ws, { closesAt: new Date(Date.now() - 1000).toISOString() });
    expect((await submit(past.id, { a: "1" })).json.code).toBe("closed");
  });
  it("enforces maxSubmissions cap", async () => {
    const f = form(ws, { maxSubmissions: 1 });
    expect((await submit(f.id, { a: "1" })).status).toBe(200);
    const r = await submit(f.id, { a: "2" });
    expect(r.status).toBe(410);
    expect(r.json.code).toBe("cap_reached");
  });
  it("rejects paused forms", async () => {
    const f = form(ws);
    updateForm(ws, f.id, { status: "paused" });
    expect((await submit(f.id, { a: "1" })).json.code).toBe("paused");
  });
});

describe("dynamic schema", () => {
  it("validate mode reports field errors and coerces types", async () => {
    const f = form(ws, { schemaMode: "validate", fields: [
      { name: "email", type: "email", required: true },
      { name: "seats", type: "number", required: false },
      { name: "code", type: "text", required: false, pattern: "^[A-Z]{2}\\d{2}$", patternMessage: "Use AB12" },
    ] });
    const bad = await submit(f.id, { email: "not-an-email", code: "zz" });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.json.errors as object)).toEqual(expect.arrayContaining(["email", "code"]));
    expect((bad.json.errors as Record<string, string>).code).toBe("Use AB12");
    const ok = await submit(f.id, { email: "a@b.example", seats: "7", code: "AB12", extra: "kept" });
    expect(ok.status).toBe(200);
    const s = getSubmission(ws, ok.json.id as string)!;
    expect(s.data.seats).toBe(7);
    expect(s.data.extra).toBe("kept");
  });
  it("strict mode rejects unknown fields", async () => {
    const f = form(ws, { schemaMode: "strict", fields: [{ name: "email", type: "email", required: true }] });
    const r = await submit(f.id, { email: "a@b.example", surprise: "x" });
    expect(r.status).toBe(422);
    expect(r.json.errors).toHaveProperty("surprise");
  });
  it("applies field mapping and renameTo", async () => {
    const f = form(ws, { fieldMapping: { "Email Address": "email" }, schemaMode: "validate", fields: [{ name: "full-name", type: "text", required: false, renameTo: "name" }] });
    const r = await submit(f.id, { "Email Address": "m@x.example", "full-name": "Mapped Person" });
    const s = getSubmission(ws, r.json.id as string)!;
    expect(s.data).toMatchObject({ email: "m@x.example", name: "Mapped Person" });
  });
});

describe("branching logic (showIf)", () => {
  const fields = [
    { name: "email", type: "email" as const, required: true },
    { name: "topic", type: "select" as const, required: true, options: ["Sales", "Support"] },
    { name: "seats", type: "number" as const, required: true, showIf: { field: "topic", op: "eq" as const, value: "Sales" } },
    { name: "budget", type: "text" as const, required: true, showIf: { field: "seats", op: "gt" as const, value: 100 } },
    { name: "order_id", type: "text" as const, required: true, showIf: { field: "topic", op: "eq" as const, value: "Support" } },
  ];
  it("requires only visible fields and drops hidden answers", async () => {
    const f = form(ws, { schemaMode: "validate", fields });
    const sales = await submit(f.id, { email: "a@b.example", topic: "Sales" });
    expect(sales.status).toBe(422);
    expect(Object.keys(sales.json.errors as object)).toEqual(["seats"]);
    const ok = await submit(f.id, { email: "a@b.example", topic: "Sales", seats: "20", order_id: "stale-value" });
    expect(ok.status).toBe(200);
    const s = getSubmission(ws, ok.json.id as string)!;
    expect(s.data).toEqual({ email: "a@b.example", topic: "Sales", seats: 20 });
  });
  it("chains conditions (budget depends on seats which depends on topic)", async () => {
    const f = form(ws, { schemaMode: "validate", fields });
    const big = await submit(f.id, { email: "a@b.example", topic: "Sales", seats: "500" });
    expect(Object.keys(big.json.errors as object)).toEqual(["budget"]);
    const support = await submit(f.id, { email: "a@b.example", topic: "Support", seats: "500", order_id: "A-1" });
    expect(support.status).toBe(200);
    expect(getSubmission(ws, support.json.id as string)!.data).toEqual({ email: "a@b.example", topic: "Support", order_id: "A-1" });
  });
  it("select fields validate options", async () => {
    const f = form(ws, { schemaMode: "validate", fields });
    const r = await submit(f.id, { email: "a@b.example", topic: "Gardening" });
    expect((r.json.errors as Record<string, string>).topic).toMatch(/one of/);
  });
});
