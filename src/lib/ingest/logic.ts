/**
 * Branching logic for dynamic forms. Client-safe (no Node imports): used by the hosted form to
 * show/hide fields, jump steps and choice buttons live, and by ingest to skip validation for
 * (and drop values of) hidden fields and apply set_value / end / route side-effects.
 */
export const SHOW_IF_OPS = [
  "eq", "neq", "contains", "not_contains", "gt", "gte", "lt", "lte",
  "in", "not_in", "filled", "empty", "matches", "domain_is", "domain_matches",
] as const;
export type ShowIfOp = (typeof SHOW_IF_OPS)[number];

export interface ShowIf {
  field: string;
  op: ShowIfOp;
  value?: string | number | boolean | string[];
}

export const LOGIC_ACTIONS = [
  "goto_step", "show_field", "hide_field", "skip_field", "end", "set_value", "route",
] as const;
export type LogicActionType = (typeof LOGIC_ACTIONS)[number];

export interface LogicAction {
  type: LogicActionType;
  /** Target step id (goto_step) or field name (show/hide/skip/set_value). */
  target?: string;
  /** Value for set_value. */
  value?: string | number | boolean | string[];
  /** Route action: assign to these owners (round-robin among them). */
  assignTo?: string[];
  /** Route action: booking URL template. */
  bookingUrl?: string;
}

export interface LogicRule {
  id?: string;
  when: ShowIf;
  /** Optional: only fire when this step is active (multi-step forms). */
  step?: string;
  actions: LogicAction[];
}

export interface FormStep {
  id: string;
  title?: string;
  /** Field names belonging to this step. Empty = inferred from order. */
  fields?: string[];
}

interface LogicField {
  name: string;
  type?: string;
  showIf?: ShowIf;
  /** Choice-button / radio option → jump to step id. Keyed by option value. */
  goto?: Record<string, string>;
  /** Default step jump when this field is answered (any value). */
  gotoStep?: string;
  /** Hide this field initially; only shown via show_field action. */
  hidden?: boolean;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map((x) => str(x).toLowerCase()) : str(v).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

function emailDomain(v: string): string {
  const at = v.lastIndexOf("@");
  return at >= 0 ? v.slice(at + 1).toLowerCase() : "";
}

/** Evaluate a single condition against submitted/live data. */
export function evalShowIf(cond: ShowIf, data: Record<string, unknown>): boolean {
  const raw = data[cond.field];
  const v = str(raw).toLowerCase();
  const target = str(cond.value).toLowerCase();
  const n = (x: unknown) => (x === null || x === undefined || str(x) === "" ? NaN : Number(x));
  switch (cond.op) {
    case "eq": return v === target;
    case "neq": return v !== target;
    case "in": return list(cond.value).includes(v);
    case "not_in": return !list(cond.value).includes(v);
    case "contains": return target !== "" && v.includes(target);
    case "not_contains": return target === "" || !v.includes(target);
    case "gt": return v !== "" && n(raw) > n(cond.value);
    case "gte": return v !== "" && n(raw) >= n(cond.value);
    case "lt": return v !== "" && n(raw) < n(cond.value);
    case "lte": return v !== "" && n(raw) <= n(cond.value);
    case "filled": return Array.isArray(raw) ? raw.length > 0 : v !== "";
    case "empty": return Array.isArray(raw) ? raw.length === 0 : v === "";
    case "matches":
      try { return new RegExp(String(cond.value ?? ""), "i").test(String(raw ?? "")); } catch { return false; }
    case "domain_is": {
      const d = emailDomain(str(raw));
      return d !== "" && (d === target || list(cond.value).includes(d));
    }
    case "domain_matches": {
      const d = emailDomain(str(raw));
      if (!d || !target) return false;
      try { return new RegExp(String(cond.value ?? ""), "i").test(d); } catch { return false; }
    }
    default: return true;
  }
}

/** Alias kept for older call sites / docs. */
export const evalCondition = evalShowIf;

/** A field is visible when it has no condition, or its condition holds AND its controlling field is itself visible. */
export function isFieldVisible(name: string, fields: LogicField[], data: Record<string, unknown>, depth = 0): boolean {
  const f = fields.find((x) => x.name === name);
  if (!f) return true;
  if (f.hidden && !f.showIf) {
    // hidden-by-default fields become visible only when a logic rule shows them (caller passes __shown)
    const shown = data.__shown;
    if (Array.isArray(shown) && shown.map(String).includes(name)) return true;
    if (!f.showIf) return false;
  }
  if (!f.showIf || depth > 10) return true;
  if (!isFieldVisible(f.showIf.field, fields, data, depth + 1)) return false;
  return evalShowIf(f.showIf, data);
}

export function hiddenFields(fields: LogicField[], data: Record<string, unknown>): string[] {
  return fields.filter((f) => !isFieldVisible(f.name, fields, data)).map((f) => f.name);
}

/** Resolve which step a choice-button / answered field should jump to. */
export function nextStepForField(field: LogicField, value: unknown): string | null {
  const v = str(value);
  if (field.goto && v && field.goto[v]) return field.goto[v];
  // case-insensitive option match
  if (field.goto && v) {
    const hit = Object.entries(field.goto).find(([k]) => k.toLowerCase() === v.toLowerCase());
    if (hit) return hit[1];
  }
  return field.gotoStep ?? null;
}

export interface LogicEvalResult {
  visible: Set<string>;
  hidden: Set<string>;
  skipped: Set<string>;
  ended: boolean;
  step: string | null;
  setValues: Record<string, unknown>;
  route: { assignTo: string[]; bookingUrl: string } | null;
}

/**
 * Evaluate form-level logic rules + per-field showIf/goto against current answers.
 * Used by the hosted form (live) and by ingest (server-side) before validation.
 */
export function evaluateLogic(
  fields: LogicField[],
  data: Record<string, unknown>,
  opts: { rules?: LogicRule[]; steps?: FormStep[]; currentStep?: string | null } = {},
): LogicEvalResult {
  const rules = opts.rules ?? [];
  const visible = new Set(fields.filter((f) => isFieldVisible(f.name, fields, data)).map((f) => f.name));
  const hidden = new Set(fields.map((f) => f.name).filter((n) => !visible.has(n)));
  const skipped = new Set<string>();
  const setValues: Record<string, unknown> = {};
  let ended = false;
  let step: string | null = opts.currentStep ?? (opts.steps?.[0]?.id ?? null);
  let route: LogicEvalResult["route"] = null;

  // Choice-button / field goto takes priority for step jumps
  for (const f of fields) {
    if (!visible.has(f.name)) continue;
    const raw = data[f.name];
    if (raw === undefined || raw === null || str(raw) === "") continue;
    const jump = nextStepForField(f, raw);
    if (jump) {
      if (jump === "__end") ended = true;
      else step = jump;
    }
  }

  for (const rule of rules) {
    if (rule.step && opts.currentStep && rule.step !== opts.currentStep) continue;
    if (!evalShowIf(rule.when, data)) continue;
    for (const action of rule.actions ?? []) {
      switch (action.type) {
        case "goto_step":
          if (action.target === "__end") ended = true;
          else if (action.target) step = action.target;
          break;
        case "show_field":
          if (action.target) { visible.add(action.target); hidden.delete(action.target); }
          break;
        case "hide_field":
          if (action.target) { hidden.add(action.target); visible.delete(action.target); }
          break;
        case "skip_field":
          if (action.target) { skipped.add(action.target); hidden.add(action.target); visible.delete(action.target); }
          break;
        case "end":
          ended = true;
          break;
        case "set_value":
          if (action.target) setValues[action.target] = action.value ?? "";
          break;
        case "route":
          route = {
            assignTo: action.assignTo ?? [],
            bookingUrl: action.bookingUrl ?? "",
          };
          break;
      }
    }
  }

  return { visible, hidden, skipped, ended, step, setValues, route };
}

/** Apply set_value results and drop hidden/skipped field values (ingest). */
export function applyLogicToData(
  fields: LogicField[],
  data: Record<string, unknown>,
  opts: { rules?: LogicRule[]; steps?: FormStep[] } = {},
): { data: Record<string, unknown>; logic: LogicEvalResult } {
  const logic = evaluateLogic(fields, data, opts);
  const next = { ...data, ...logic.setValues };
  for (const name of logic.hidden) delete next[name];
  for (const name of logic.skipped) delete next[name];
  delete next.__shown;
  return { data: next, logic };
}
