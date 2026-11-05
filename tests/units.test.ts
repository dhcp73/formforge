import { describe, it, expect } from "vitest";
import { scoreSpam } from "@/lib/ingest/spam";
import { detectType, coerce } from "@/lib/ingest/schema";
import { emptyEnrichment, mergeFields, getPath } from "@/lib/enrich/merge";
import { emailEnricher, geoEnricher, userAgentEnricher, companyEnricher, extractHints, isDisposable } from "@/lib/enrich/local";
import { runEnricher, heuristicFit } from "@/lib/enrich/pipeline";
import { encrypt, decrypt, safeEqual, maskSecret, hmacHex } from "@/lib/secrets";
import { evaluateRules, evalCondition, type RoutingRule } from "@/lib/routing";
import { signPayload, verifySignature } from "@/lib/webhooks";
import { nextRun } from "@/lib/schedules";
import { formAvailability } from "@/lib/forms";
import { normalizeSettings } from "@/lib/types";

const ctx = (data: Record<string, unknown>, ip: string | null = "81.2.69.142", ua: string | null = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36") => {
  const h = extractHints(data);
  return { workspaceId: "ws_t", data, email: h.email, domain: h.domain, companyName: h.companyName, ip, userAgent: ua };
};

describe("spam scoring", () => {
  it("scores clean submissions low and spammy ones high with reasons", () => {
    expect(scoreSpam({ data: { message: "Hi, could we book a demo next week?" }, honeypotTriggered: false, duplicate: false, userAgent: "Mozilla/5.0" }).score).toBeLessThan(20);
    const s = scoreSpam({ data: { message: "BUY VIAGRA CASINO NOW http://a.x http://b.x http://c.x" }, honeypotTriggered: false, duplicate: false, userAgent: null, email: { disposable: true } as never });
    expect(s.score).toBeGreaterThanOrEqual(60);
    expect(s.reasons.join(" ")).toMatch(/links/);
    expect(s.reasons.join(" ")).toMatch(/Disposable/);
  });
  it("honeypot is always 100", () => {
    expect(scoreSpam({ data: {}, honeypotTriggered: true, duplicate: false, userAgent: "x" }).score).toBe(100);
  });
  it("flags too-fast submissions", () => {
    expect(scoreSpam({ data: { a: "b" }, honeypotTriggered: false, duplicate: false, userAgent: "Mozilla/5.0", elapsedMs: 200 }).reasons.join()).toMatch(/too fast/);
  });
});

describe("type detection & coercion", () => {
  it.each([["email", "a@b.co", "email"], ["website", "https://x.io", "url"], ["seats", "42", "number"], ["phone", "+44 20 7946 0958", "phone"], ["agree", "true", "boolean"], ["when", "2026-11-04", "date"], ["message", "x".repeat(300), "longtext"]])("%s → %s", (name, value, type) => {
    expect(detectType(name, value)).toBe(type);
  });
  it("coerces values", () => {
    expect(coerce("number", "3.5")).toBe(3.5);
    expect(coerce("boolean", "on")).toBe(true);
  });
});

describe("offline enrichment", () => {
  it("email: syntax, disposable, free, role", async () => {
    const e = emptyEnrichment();
    await runEnricher(emailEnricher, ctx({ email: "info@mailinator.com" }), e, { log: false });
    expect(e.email).toMatchObject({ syntaxValid: true, disposable: true, role: true });
    expect(isDisposable("mailinator.com")).toBe(true);
    const f = emptyEnrichment();
    await runEnricher(emailEnricher, ctx({ email: "someone@gmail.com" }), f, { log: false });
    expect(f.email).toMatchObject({ freeProvider: true });
  });
  it("geo from IP (offline db) and private IPs", async () => {
    const e = emptyEnrichment();
    await runEnricher(geoEnricher, ctx({}, "81.2.69.142"), e, { log: false });
    expect((e.geo as { country: string }).country).toBe("GB");
    expect(e.attribution["geo.country"]).toBe("ipgeo");
    const p = emptyEnrichment();
    await runEnricher(geoEnricher, ctx({}, "10.0.0.5"), p, { log: false });
    expect((p.geo as { private: boolean }).private).toBe(true);
  });
  it("user agent + bot detection", async () => {
    const e = emptyEnrichment();
    await runEnricher(userAgentEnricher, ctx({}), e, { log: false });
    expect((e.userAgent as { browser: string }).browser).toBe("Chrome");
    const b = emptyEnrichment();
    await runEnricher(userAgentEnricher, ctx({}, null, "curl/8.0"), b, { log: false });
    expect((b.userAgent as { isBot: boolean }).isBot).toBe(true);
  });
  it("company from email domain via offline dataset", async () => {
    const e = emptyEnrichment();
    await runEnricher(companyEnricher, ctx({ email: "pat@monzo.com" }), e, { log: false });
    expect(e.company).toMatchObject({ name: "Monzo", domain: "monzo.com", country: "GB" });
    expect(extractHints({ email: "a@gmail.com", website: "https://www.acme.io/x" }).domain).toBe("acme.io");
  });
  it("heuristic fit rewards business email + company size", () => {
    const e = emptyEnrichment();
    mergeFields(e, "offline", { "email.valid": true, "email.freeProvider": false, "company.employees": 400, "company.industry": "SaaS", "company.country": "GB" });
    expect(heuristicFit(e, { message: "We'd like a demo for our team" })).toBeGreaterThanOrEqual(80);
  });
});

describe("waterfall merge & attribution", () => {
  it("higher-priority providers win, lower ones fill gaps", () => {
    const e = emptyEnrichment();
    mergeFields(e, "ai", { "company.industry": "Software (guess)", "ai.summary": "x" });
    mergeFields(e, "offline", { "company.name": "Acme", "company.industry": "SaaS" });
    mergeFields(e, "apollo", { "company.employees": 250, "company.industry": "Computer Software" });
    mergeFields(e, "ai", { "company.industry": "nope", "company.employees": 1 });
    expect(getPath(e, "company.industry")).toBe("Computer Software");
    expect(getPath(e, "company.employees")).toBe(250);
    expect(getPath(e, "company.name")).toBe("Acme");
    expect(e.attribution).toMatchObject({ "company.industry": "apollo", "company.employees": "apollo", "company.name": "offline", "ai.summary": "ai" });
  });
  it("ignores null/empty values", () => {
    const e = emptyEnrichment();
    mergeFields(e, "apollo", { "company.name": null, "company.city": "" });
    expect(e.company).toBeUndefined();
  });
});

describe("secrets", () => {
  it("encrypts with AES-GCM and detects tampering", () => {
    const t = encrypt("sk-live-123");
    expect(t.startsWith("v1.")).toBe(true);
    expect(t).not.toContain("sk-live");
    expect(decrypt(t)).toBe("sk-live-123");
    const bad = t.slice(0, -2) + (t.endsWith("A") ? "BB" : "AA");
    expect(() => decrypt(bad)).toThrow();
  });
  it("masks and compares safely", () => {
    expect(maskSecret("sk-abcdefghijklmnop")).not.toContain("efghijkl");
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(hmacHex("k", "v")).toHaveLength(64);
  });
});

const rule = (over: Partial<RoutingRule>): RoutingRule => ({ id: "r" + Math.random(), workspaceId: "w", formId: null, name: "R", priority: 100, match: "all", conditions: [], actions: { assignTo: [], tags: [], notifyEmails: [], webhookUrl: "", markSpam: false }, stopOnMatch: true, active: true, hitCount: 0, rrIndex: 0, createdAt: "", ...over });

describe("routing engine", () => {
  const lead = { company: { employees: 300, country: "GB", industry: "Fintech", domain: "monzo.com" }, person: { title: "VP Engineering" }, email: { freeProvider: false }, fitScore: 82, data: { message: "pricing please" } };
  it.each([
    ["company.employees", "gte", 200, true], ["company.employees", "lt", 200, false], ["company.country", "in", ["GB", "DE"], true], ["company.country", "not_in", "GB,DE", false],
    ["person.title", "contains", "engineering", true], ["company.domain", "ends_with", ".com", true], ["company.industry", "matches", "^fin", true], ["company.revenue", "not_exists", undefined, true],
    ["email.freeProvider", "eq", false, true], ["data.message", "not_contains", "pricing", false], ["fitScore", "gt", 90, false],
  ])("%s %s %j → %s", (field, op, value, expected) => {
    expect(evalCondition(lead, { field, op: op as never, value }).ok).toBe(expected);
  });
  it("evaluates by priority, stops on match and explains steps", () => {
    const r1 = rule({ name: "Small", priority: 1, conditions: [{ field: "company.employees", op: "lt", value: 50 }], actions: { assignTo: ["a"], tags: ["smb"], notifyEmails: [], webhookUrl: "", markSpam: false } });
    const r2 = rule({ name: "Ent", priority: 2, conditions: [{ field: "company.employees", op: "gte", value: 200 }, { field: "company.country", op: "eq", value: "GB" }], actions: { assignTo: ["ae@x"], tags: ["enterprise"], notifyEmails: [], webhookUrl: "", markSpam: false } });
    const r3 = rule({ name: "Never", priority: 3, conditions: [{ field: "company.employees", op: "exists" }], actions: { assignTo: ["z"], tags: ["z"], notifyEmails: [], webhookUrl: "", markSpam: false } });
    const decision = evaluateRules([r3, r2, r1], lead);
    const matched = decision.matched;
    expect(decision.owner).toBe("ae@x");
    expect(decision.tags).toEqual(["enterprise"]);
    expect(matched.map((m) => m.name)).toEqual(["Ent"]);
    expect(decision.steps.map((s) => [s.name, s.matched])).toEqual([["Small", false], ["Ent", true]]);
  });
  it("match=any and inactive rules", () => {
    const r = rule({ match: "any", conditions: [{ field: "company.employees", op: "lt", value: 10 }, { field: "company.country", op: "eq", value: "GB" }], actions: { assignTo: ["x"], tags: [], notifyEmails: [], webhookUrl: "", markSpam: false } });
    expect(evaluateRules([r], lead).owner).toBe("x");
    expect(evaluateRules([{ ...r, active: false }], lead).owner).toBeNull();
  });
});

describe("webhook signatures", () => {
  it("signs t=…,v1=… and verifies with tolerance", () => {
    const sig = signPayload("whsec_test", '{"a":1}');
    expect(sig).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(verifySignature("whsec_test", '{"a":1}', sig)).toBe(true);
    expect(verifySignature("whsec_test", '{"a":2}', sig)).toBe(false);
    expect(verifySignature("other", '{"a":1}', sig)).toBe(false);
  });
});

describe("scheduling helpers", () => {
  it("computes next cron run in a timezone", () => {
    const from = new Date("2026-11-04T08:30:00Z");
    expect(nextRun("0 9 * * *", "Europe/London", from)).toBe("2026-11-04T09:00:00.000Z");
    expect(nextRun("0 9 * * *", "America/New_York", from)).toBe("2026-11-04T14:00:00.000Z");
  });
  it("form availability windows", () => {
    const base = { id: "f", workspaceId: "w", name: "f", description: "", status: "active" as const, createdAt: "", updatedAt: "" };
    const at = new Date("2026-11-04T12:00:00Z");
    expect(formAvailability({ ...base, settings: normalizeSettings({ opensAt: "2026-11-05T00:00:00Z" }) }, 0, at)).toEqual({ open: false, reason: "not_open_yet" });
    expect(formAvailability({ ...base, settings: normalizeSettings({ closesAt: "2026-11-01T00:00:00Z" }) }, 0, at)).toEqual({ open: false, reason: "closed" });
    expect(formAvailability({ ...base, settings: normalizeSettings({ maxSubmissions: 5 }) }, 5, at)).toEqual({ open: false, reason: "cap_reached" });
    expect(formAvailability({ ...base, settings: normalizeSettings({}) }, 5, at)).toEqual({ open: true });
  });
});

import { evalShowIf, isFieldVisible } from "@/lib/ingest/logic";
describe("showIf evaluator", () => {
  it.each([
    [{ field: "a", op: "eq", value: "Yes" }, { a: "yes" }, true], [{ field: "a", op: "neq", value: "x" }, { a: "x" }, false],
    [{ field: "a", op: "in", value: ["x", "y"] }, { a: "y" }, true], [{ field: "a", op: "not_in", value: "x,y" }, { a: "z" }, true],
    [{ field: "a", op: "contains", value: "pricing" }, { a: "Pricing please" }, true], [{ field: "a", op: "gt", value: 5 }, { a: "6" }, true],
    [{ field: "a", op: "lt", value: 5 }, { a: "" }, false], [{ field: "a", op: "filled" }, { a: " " }, false], [{ field: "a", op: "empty" }, {}, true],
  ])("%j on %j → %s", (cond, data, expected) => { expect(evalShowIf(cond as never, data)).toBe(expected); });
  it("guards against cycles", () => {
    const fields = [{ name: "a", showIf: { field: "b", op: "filled" as const } }, { name: "b", showIf: { field: "a", op: "filled" as const } }];
    expect(() => isFieldVisible("a", fields, {})).not.toThrow();
  });
});
