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

/** Pure evaluation (no side effects). `pickOwner` chooses from assignTo (round-robin in DB mode). */
export function evaluateRules(rules: RoutingRule[], ctx: Record<string, unknown>, pickOwner: (rule: RoutingRule) => string | null = (r) => r.actions.assignTo[0] ?? null) {
  const steps: RoutingStep[] = [];
  const matched: RoutingRule[] = [];
  let owner: string | null = null;
  const tags = new Set<string>();
  for (const rule of [...rules].filter((r) => r.active).sort((a, b) => a.priority - b.priority)) {
    const results = rule.conditions.map((c) => evalCondition(ctx, c));
    const ok = rule.match === "all" ? results.every((r) => r.ok) : results.some((r) => r.ok);
    steps.push({ ruleId: rule.id, name: rule.name, matched: ok, details: results.map((r) => r.detail) });
    if (!ok) continue;
    matched.push(rule);
    if (!owner && rule.actions.assignTo.length) owner = pickOwner(rule);
    rule.actions.tags.forEach((t) => tags.add(t));
    if (rule.stopOnMatch) break;
  }
  return { steps, matched, owner, tags: Array.from(tags) };
}

/** Evaluate + persist (round-robin index, hit counts). Returns decision; caller stores on submission. */
export function routeSubmission(ws: string, s: SubmissionRecord): { decision: RoutingDecision; matched: RoutingRule[] } {
  const db = getDb();
  const rules = listRules(ws, s.formId);
  const res = evaluateRules(rules, leadContext(s), (rule) => {
    const list = rule.actions.assignTo;
    const pick = list[rule.rrIndex % list.length];
    db.prepare("UPDATE routing_rules SET rr_index = rr_index + 1 WHERE id = ?").run(rule.id);
    return pick;
  });
  for (const r of res.matched) db.prepare("UPDATE routing_rules SET hit_count = hit_count + 1 WHERE id = ?").run(r.id);
  return {
    decision: { evaluatedAt: now(), steps: res.steps, owner: res.owner, tags: res.tags, matchedRules: res.matched.map((r) => r.id) },
    matched: res.matched,
  };
}
