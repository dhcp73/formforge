import { hiddenFields } from "./logic";
import type { FieldDef, FieldType, FormSettings } from "../types";
import { EMAIL_RE } from "../enrich/local";

const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;
const PHONE_RE = /^\+?[0-9\s().-]{7,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Auto-detect a field's type from its name + value (schema-less mode). */
export function detectType(name: string, value: unknown): FieldType {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (value && typeof value === "object" && "name" in (value as object) && "size" in (value as object)) return "file";
  const v = String(value ?? "").trim();
  if (EMAIL_RE.test(v)) return "email";
  if (URL_RE.test(v)) return "url";
  if (DATE_RE.test(v)) return "date";
  if (/^(true|false|on|off|yes|no)$/i.test(v) && /agree|consent|subscribe|opt|accept|newsletter|terms/i.test(name)) return "boolean";
  if (/^-?\d+(\.\d+)?$/.test(v) && !/phone|tel|mobile|zip|postal/i.test(name)) return "number";
  if (PHONE_RE.test(v) && /phone|tel|mobile|whatsapp/i.test(name)) return "phone";
  if (v.length > 140 || v.includes("\n")) return "longtext";
  return "text";
}

/** Coerce string values of known types (numbers, booleans). */
export function coerce(type: FieldType, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (type === "number" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  if (type === "boolean") return /^(true|on|yes|1)$/i.test(value.trim());
  return value;
}

export function applyMapping(data: Record<string, unknown>, settings: FormSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const renames: Record<string, string> = { ...settings.fieldMapping };
  for (const f of settings.fields) if (f.renameTo) renames[f.name] = f.renameTo;
  for (const [k, v] of Object.entries(data)) out[renames[k] || k] = v;
  return out;
}

function validateOne(f: FieldDef, raw: unknown): string | null {
  const empty = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
  if (empty) return f.required ? `${f.label || f.name} is required` : null;
  if (f.type === "file") return null;
  const v = String(raw).trim();
  const label = f.label || f.name;
  switch (f.type) {
    case "email": if (!EMAIL_RE.test(v)) return `${label} must be a valid email address`; break;
    case "number": if (Number.isNaN(Number(v))) return `${label} must be a number`; break;
    case "url": if (!URL_RE.test(v)) return `${label} must be a valid URL (https://…)`; break;
    case "phone": if (!PHONE_RE.test(v)) return `${label} must be a valid phone number`; break;
    case "date": if (Number.isNaN(Date.parse(v))) return `${label} must be a valid date`; break;
    case "select": if (f.options?.length && !f.options.some((o) => o.toLowerCase() === v.toLowerCase())) return `${label} must be one of: ${f.options.join(", ")}`; break;
    case "boolean": if (!/^(true|false|on|off|yes|no|1|0)$/i.test(v)) return `${label} must be true or false`; break;
  }
  if (f.minLength && v.length < f.minLength) return `${label} must be at least ${f.minLength} characters`;
  if (f.maxLength && v.length > f.maxLength) return `${label} must be at most ${f.maxLength} characters`;
  if (f.pattern) {
    try { if (!new RegExp(f.pattern).test(v)) return f.patternMessage || `${label} has an invalid format`; } catch { /* bad regex ignored */ }
  }
  return null;
}

/**
 * Validate (pre-mapping keys). Returns field → message. In "strict" mode unknown fields are rejected.
 */
export function validate(data: Record<string, unknown>, files: string[], settings: FormSettings): Record<string, string> {
  if (settings.schemaMode === "off") return {};
  const errors: Record<string, string> = {};
  const hidden = new Set(hiddenFields(settings.fields, data));
  for (const f of settings.fields) {
    if (hidden.has(f.name)) continue; // branching: hidden fields are never required
    const value = f.type === "file" ? (files.includes(f.name) ? "file" : undefined) : data[f.name];
    const err = validateOne(f, value);
    if (err) errors[f.name] = err;
  }
  if (settings.schemaMode === "strict") {
    const known = new Set(settings.fields.map((f) => f.name));
    for (const k of [...Object.keys(data), ...files]) if (!known.has(k)) errors[k] = `Unknown field "${k}"`;
  }
  return errors;
}

export function fieldTypesFor(data: Record<string, unknown>, settings: FormSettings): Record<string, FieldType> {
  const declared = new Map(settings.fields.map((f) => [f.renameTo || f.name, f.type]));
  const out: Record<string, FieldType> = {};
  for (const [k, v] of Object.entries(data)) out[k] = declared.get(k) ?? detectType(k, v);
  return out;
}
