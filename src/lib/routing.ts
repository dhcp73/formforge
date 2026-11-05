import { z } from "zod";
import { getDb, now, parseJson } from "./db";
import { newId } from "./ids";
import { getPath } from "./enrich/merge";
import type { RoutingDecision, RoutingStep, SubmissionRecord } from "./types";

export const OPERATORS = ["eq", "neq", "contains", "not_contains", "gt", "gte", "lt", "lte", "in", "not_in", "exists", "not_exists", "ends_with", "matches"] as const;
export type Operator = (typeof OPERATORS)[number];

export const conditionSchema = z.object({ field: z.string().min(1), op: z.enum(OPERATORS), value: z.any().optional() });
export const actionsSchema = z.object({
  assignTo: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  notifyEmails: z.array(z.string().email()).default([]),
  webhookUrl: z.string().url().or(z.literal("")).default(""),
  markSpam: z.boolean().default(false),
  /** Weighted round-robin: owner → weight (default 1; 0 = paused). */
  weights: z.record(z.string(), z.number().int().min(0).max(100)).default({}),
  /** Account-owner stickiness: reuse the owner of earlier leads from the same company domain. */
  sticky: z.boolean().default(false),
  /** Shown to the lead after submit. Supports {{owner}}, {{owner_name}}, {{email}}, {{name}}, {{company}}. */
  bookingUrl: z.string().max(500).default(""),
  /** Per-owner booking links (owner → URL); wins over bookingUrl. */
  ownerBookingUrls: z.record(z.string(), z.string().url()).default({}),
});
export const ruleInputSchema = z.object({
  name: z.string().min(1).max(120),
  formId: z.string().nullable().optional(),
  priority: z.number().int().default(100),
  match: z.enum(["all", "any"]).default("all"),
  conditions: z.array(conditionSchema).min(1, "Add at least one condition"),
  actions: actionsSchema,
  stopOnMatch: z.boolean().default(true),
  active: z.boolean().default(true),
});
export type Condition = z.infer<typeof conditionSchema>;
export type RuleInput = z.infer<typeof ruleInputSchema>;
export interface RoutingRule extends RuleInput { id: string; workspaceId: string; hitCount: number; rrIndex: number; createdAt: string; formId: string | null }

/** Fields a rule can reference (suggested in UI; any data.* path also works). */
export const ROUTABLE_FIELDS = [
  "company.employees", "company.country", "company.industry", "company.domain", "company.revenue", "company.name",
  "person.title", "person.seniority", "geo.country", "email.freeProvider", "email.disposable", "email.valid",
  "ai.intent", "ai.icpScore", "fitScore", "spamScore", "userAgent.device",
];

type Row = { id: string; workspace_id: string; form_id: string | null; name: string; priority: number; match: string; conditions: string; actions: string; stop_on_match: number; active: number; hit_count: number; rr_index: number; created_at: string };
const map = (r: Row): RoutingRule => ({
  id: r.id, workspaceId: r.workspace_id, formId: r.form_id, name: r.name, priority: r.priority, match: r.match as "all" | "any",
  conditions: parseJson(r.conditions, []), actions: actionsSchema.parse(parseJson(r.actions, {})), stopOnMatch: !!r.stop_on_match,
  active: !!r.active, hitCount: r.hit_count, rrIndex: r.rr_index, createdAt: r.created_at,
});

export function listRules(ws: string, formId?: string): RoutingRule[] {
  const rows = getDb().prepare("SELECT * FROM routing_rules WHERE workspace_id = ? ORDER BY priority ASC, created_at ASC").all(ws) as Row[];
  return rows.map(map).filter((r) => !formId || !r.formId || r.formId === formId);
}
export function getRule(ws: string, id: string) {
  const r = getDb().prepare("SELECT * FROM routing_rules WHERE id = ? AND workspace_id = ?").get(id, ws) as Row | undefined;
  return r ? map(r) : null;
}
export function createRule(ws: string, input: unknown): RoutingRule {
  const v = ruleInputSchema.parse(input);
  const id = newId("rule");
  getDb()
    .prepare("INSERT INTO routing_rules (id, workspace_id, form_id, name, priority, match, conditions, actions, stop_on_match, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, ws, v.formId || null, v.name, v.priority, v.match, JSON.stringify(v.conditions), JSON.stringify(v.actions), v.stopOnMatch ? 1 : 0, v.active ? 1 : 0, now());
  return getRule(ws, id)!;
}
export function updateRule(ws: string, id: string, input: unknown): RoutingRule {
  const cur = getRule(ws, id);
  if (!cur) throw new Error("Rule not found");
  const v = ruleInputSchema.parse({ ...cur, ...(input as object) });
  getDb()
    .prepare("UPDATE routing_rules SET form_id = ?, name = ?, priority = ?, match = ?, conditions = ?, actions = ?, stop_on_match = ?, active = ? WHERE id = ? AND workspace_id = ?")
    .run(v.formId || null, v.name, v.priority, v.match, JSON.stringify(v.conditions), JSON.stringify(v.actions), v.stopOnMatch ? 1 : 0, v.active ? 1 : 0, id, ws);
  return getRule(ws, id)!;
}
export function deleteRule(ws: string, id: string) {
  return getDb().prepare("DELETE FROM routing_rules WHERE id = ? AND workspace_id = ?").run(id, ws).changes > 0;
}

/** Lead context = answers + merged enrichment + scores. */
export function leadContext(s: Pick<SubmissionRecord, "data" | "enrichment" | "spamScore" | "fitScore">): Record<string, unknown> {
  // raw answers first so enrichment namespaces (email.*, company.*) win; raw values stay reachable as data.<field>
  return { ...s.data, ...s.enrichment, data: s.data, fitScore: s.fitScore ?? (s.enrichment as { fitScore?: number }).fitScore ?? null, spamScore: s.spamScore };
}

export function evalCondition(ctx: Record<string, unknown>, c: Condition): { ok: boolean; detail: string } {
  const actual = getPath(ctx, c.field);
  const a = typeof actual === "string" ? actual.toLowerCase() : actual;
  const listOf = (v: unknown) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  const val = typeof c.value === "string" ? c.value.toLowerCase() : c.value;
  const n = (x: unknown) => (x === null || x === undefined || x === "" ? NaN : Number(x));
  let ok = false;
  switch (c.op) {
    case "eq": ok = String(a ?? "") === String(val ?? ""); break;
    case "neq": ok = String(a ?? "") !== String(val ?? ""); break;
    case "contains": ok = String(a ?? "").includes(String(val ?? "")); break;
    case "not_contains": ok = !String(a ?? "").includes(String(val ?? "")); break;
    case "gt": ok = n(actual) > n(c.value); break;
    case "gte": ok = n(actual) >= n(c.value); break;
    case "lt": ok = n(actual) < n(c.value); break;
    case "lte": ok = n(actual) <= n(c.value); break;
    case "in": ok = listOf(c.value).includes(String(a ?? "")); break;
    case "not_in": ok = !listOf(c.value).includes(String(a ?? "")); break;
    case "exists": ok = actual !== undefined && actual !== null && actual !== ""; break;
    case "not_exists": ok = actual === undefined || actual === null || actual === ""; break;
    case "ends_with": ok = String(a ?? "").endsWith(String(val ?? "")); break;
    case "matches": try { ok = new RegExp(String(c.value ?? ""), "i").test(String(actual ?? "")); } catch { ok = false; } break;
  }
  const shown = actual === undefined ? "∅" : JSON.stringify(actual);
  return { ok, detail: `${c.field} ${c.op} ${c.value === undefined ? "" : JSON.stringify(c.value)} → actual ${shown} ${ok ? "✓" : "✗"}` };
}

/** Smooth weighted round-robin (nginx-style): deterministic sequence of owners for a cycle. */
export function weightedSequence(owners: string[], weights: Record<string, number> = {}): string[] {
  const w = owners.map((o) => ({ o, w: Math.max(0, weights[o] ?? 1), cur: 0 }));
  const total = w.reduce((a, x) => a + x.w, 0);
  if (!total) return [];
  const seq: string[] = [];
  for (let i = 0; i < total; i++) {
    for (const x of w) x.cur += x.w;
    const best = w.reduce((a, b) => (b.cur > a.cur ? b : a));
    best.cur -= total;
    seq.push(best.o);
  }
  return seq;
}

/** Pick the owner for the n-th lead routed by a rule. */
export function pickWeighted(rule: Pick<RoutingRule, "actions">, n: number): string | null {
  const seq = weightedSequence(rule.actions.assignTo, rule.actions.weights);
  return seq.length ? seq[n % seq.length] : null;
}

/** Company domain used for account stickiness: enriched company domain, else a non-free email domain. */
export function accountDomain(ctx: Record<string, unknown>): string | null {
  const c = getPath(ctx, "company.domain");
  if (typeof c === "string" && c) return c.toLowerCase();
  const free = getPath(ctx, "email.freeProvider"), d = getPath(ctx, "email.domain");
  return !free && typeof d === "string" && d ? d.toLowerCase() : null;
}

/** Owner of the most recent earlier lead from the same account (same workspace), limited to the rule's owner pool when it has one. */
export function findAccountOwner(ws: string, domain: string, excludeId?: string, pool: string[] = []): string | null {
  const inPool = pool.length ? ` AND owner IN (${pool.map(() => "?").join(", ")})` : "";
  const r = getDb().prepare(
    `SELECT owner FROM submissions WHERE workspace_id = ? AND owner IS NOT NULL AND owner != '' AND id != ? AND is_spam = 0
       AND (lower(json_extract(enrichment, '$.company.domain')) = ? OR (lower(json_extract(enrichment, '$.email.domain')) = ? AND COALESCE(json_extract(enrichment, '$.email.freeProvider'), 0) = 0))${inPool}
     ORDER BY created_at DESC LIMIT 1`,
  ).get(ws, excludeId ?? "", domain, domain, ...pool) as { owner: string } | undefined;
  return r?.owner ?? null;
}

/** Booking link for the chosen owner (per-owner link, else the rule template). */
export function bookingLink(rule: RoutingRule, owner: string | null, ctx: Record<string, unknown>): string | null {
  const tpl = (owner && rule.actions.ownerBookingUrls[owner]) || rule.actions.bookingUrl;
  if (!tpl) return null;
  const vals: Record<string, string> = {
    owner: owner ?? "", owner_name: (owner ?? "").split("@")[0],
    email: String(getPath(ctx, "email.address") ?? getPath(ctx, "data.email") ?? ""),
    name: String(getPath(ctx, "data.name") ?? ""), company: String(getPath(ctx, "company.name") ?? getPath(ctx, "data.company") ?? ""),
  };
  const url = tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => encodeURIComponent(vals[k] ?? ""));
  return /^https?:\/\//i.test(url) ? url : null;
}

/** Pure evaluation (no side effects). `pickOwner` chooses from assignTo (round-robin in DB mode). */
export function evaluateRules(rules: RoutingRule[], ctx: Record<string, unknown>, pickOwner: (rule: RoutingRule) => string | null = (r) => r.actions.assignTo[0] ?? null) {
  const steps: RoutingStep[] = [];
  const matched: RoutingRule[] = [];
  let owner: string | null = null;
  let ownerRule: RoutingRule | null = null;
  const tags = new Set<string>();
  for (const rule of [...rules].filter((r) => r.active).sort((a, b) => a.priority - b.priority)) {
    const results = rule.conditions.map((c) => evalCondition(ctx, c));
    const ok = rule.match === "all" ? results.every((r) => r.ok) : results.some((r) => r.ok);
    steps.push({ ruleId: rule.id, name: rule.name, matched: ok, details: results.map((r) => r.detail) });
    if (!ok) continue;
    matched.push(rule);
    if (!owner && (rule.actions.assignTo.length || rule.actions.sticky)) { owner = pickOwner(rule); if (owner) ownerRule = rule; }
    rule.actions.tags.forEach((t) => tags.add(t));
    if (rule.stopOnMatch) break;
  }
  const bookingRule = ownerRule ?? matched.find((r) => r.actions.bookingUrl) ?? null;
  return { steps, matched, owner, ownerRule, tags: Array.from(tags), bookingUrl: bookingRule ? bookingLink(bookingRule, owner, ctx) : null };
}

/**
 * Owner picker with stickiness + weighted round-robin.
 * `commit` advances the rule's round-robin counter; preview mode (at submit time) only peeks.
 */
function ownerPicker(ws: string, s: Pick<SubmissionRecord, "id" | "owner">, ctx: Record<string, unknown>, commit: boolean, notes: Map<string, string>) {
  const db = getDb();
  return (rule: RoutingRule): string | null => {
    if (rule.actions.sticky) {
      const domain = accountDomain(ctx);
      const acct = domain ? findAccountOwner(ws, domain, s.id, rule.actions.assignTo) : null;
      if (acct) { notes.set(rule.id, `sticky: ${domain} is owned by ${acct}`); return acct; }
    }
    if (!rule.actions.assignTo.length) return null;
    // keep the owner promised at submit time (preview) if this rule can assign them
    if (s.owner && rule.actions.assignTo.includes(s.owner) && (rule.actions.weights[s.owner] ?? 1) > 0) {
      if (commit) db.prepare("UPDATE routing_rules SET rr_index = rr_index + 1 WHERE id = ?").run(rule.id);
      notes.set(rule.id, `round-robin: kept ${s.owner}`);
      return s.owner;
    }
    const pick = pickWeighted(rule, rule.rrIndex);
    if (commit && pick) db.prepare("UPDATE routing_rules SET rr_index = rr_index + 1 WHERE id = ?").run(rule.id);
    if (pick) notes.set(rule.id, `${Object.keys(rule.actions.weights).length ? "weighted " : ""}round-robin → ${pick}`);
    return pick;
  };
}

/** Side-effect-free routing preview used at submit time (owner + booking link for the thank-you step). */
export function previewRouting(ws: string, s: SubmissionRecord) {
  const ctx = leadContext(s);
  const notes = new Map<string, string>();
  const res = evaluateRules(listRules(ws, s.formId), ctx, ownerPicker(ws, { id: s.id, owner: null }, ctx, false, notes));
  return { owner: res.owner, bookingUrl: res.bookingUrl, tags: res.tags };
}

/** Evaluate + persist (round-robin index, hit counts). Returns decision; caller stores on submission. */

/** True when this email has a connected calendar (used to zero-weight unavailable reps). */
function getConnectionHint(ws: string, email: string): boolean {
  const r = getDb().prepare("SELECT 1 FROM oauth_connections WHERE workspace_id = ? AND lower(account_email) = lower(?) LIMIT 1").get(ws, email);
  return !!r;
}

export function routeSubmission(ws: string, s: SubmissionRecord, opts: { availableOwners?: Set<string> } = {}): { decision: RoutingDecision; matched: RoutingRule[] } {
  const db = getDb();
  let rules = listRules(ws, s.formId);
  if (opts.availableOwners && opts.availableOwners.size) {
    rules = rules.map((r) => {
      if (!r.actions.assignTo.length) return r;
      const weights = { ...r.actions.weights };
      for (const o of r.actions.assignTo) {
        if (!opts.availableOwners!.has(o) && getConnectionHint(ws, o)) weights[o] = 0;
      }
      return { ...r, actions: { ...r.actions, weights } };
    });
  }
  const ctx = leadContext(s);
  const notes = new Map<string, string>();
  const res = evaluateRules(rules, ctx, ownerPicker(ws, s, ctx, true, notes));
  for (const r of res.matched) db.prepare("UPDATE routing_rules SET hit_count = hit_count + 1 WHERE id = ?").run(r.id);
  const steps = res.steps.map((st) => (notes.has(st.ruleId) ? { ...st, details: [...st.details, notes.get(st.ruleId)!] } : st));
  return {
    decision: { evaluatedAt: now(), steps, owner: res.owner, tags: res.tags, matchedRules: res.matched.map((r) => r.id), bookingUrl: res.bookingUrl },
    matched: res.matched,
  };
}
