/**
 * Branching logic for dynamic forms. Client-safe (no Node imports): used by the hosted form to
 * show/hide fields live, and by ingest to skip validation for (and drop values of) hidden fields.
 */
export const SHOW_IF_OPS = ["eq", "neq", "in", "not_in", "contains", "gt", "lt", "filled", "empty"] as const;
export type ShowIfOp = (typeof SHOW_IF_OPS)[number];
export interface ShowIf { field: string; op: ShowIfOp; value?: string | number | boolean | string[] }
interface LogicField { name: string; showIf?: ShowIf }

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x).toLowerCase()) : str(v).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

export function evalShowIf(cond: ShowIf, data: Record<string, unknown>): boolean {
  const raw = data[cond.field];
  const v = str(raw).toLowerCase();
  const target = str(cond.value).toLowerCase();
  switch (cond.op) {
    case "eq": return v === target;
    case "neq": return v !== target;
    case "in": return list(cond.value).includes(v);
    case "not_in": return !list(cond.value).includes(v);
    case "contains": return target !== "" && v.includes(target);
    case "gt": return v !== "" && Number(v) > Number(cond.value);
    case "lt": return v !== "" && Number(v) < Number(cond.value);
    case "filled": return v !== "";
    case "empty": return v === "";
    default: return true;
  }
}

/** A field is visible when it has no condition, or its condition holds AND its controlling field is itself visible. */
export function isFieldVisible(name: string, fields: LogicField[], data: Record<string, unknown>, depth = 0): boolean {
  const f = fields.find((x) => x.name === name);
  if (!f?.showIf || depth > 10) return true;
  if (!isFieldVisible(f.showIf.field, fields, data, depth + 1)) return false;
  return evalShowIf(f.showIf, data);
}

export function hiddenFields(fields: LogicField[], data: Record<string, unknown>): string[] {
  return fields.filter((f) => f.showIf && !isFieldVisible(f.name, fields, data)).map((f) => f.name);
}
