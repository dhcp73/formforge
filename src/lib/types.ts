import { z } from "zod";
import { SHOW_IF_OPS } from "./ingest/logic";

export const FIELD_TYPES = ["text", "email", "number", "url", "phone", "date", "boolean", "file", "longtext", "select"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const fieldDefSchema = z.object({
  name: z.string().min(1).max(100),
  label: z.string().max(200).optional(),
  type: z.enum(FIELD_TYPES).default("text"),
  required: z.boolean().default(false),
  pattern: z.string().max(500).optional(),
  patternMessage: z.string().max(200).optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  renameTo: z.string().max(100).optional(),
  /** Choices for `select` fields. */
  options: z.array(z.string().min(1).max(200)).max(100).optional(),
  /** Branching logic: only show/validate/store this field when the condition on another field holds. */
  showIf: z.object({ field: z.string().min(1), op: z.enum(SHOW_IF_OPS), value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional() }).optional(),
});
export type FieldDef = z.infer<typeof fieldDefSchema>;

export const formSettingsSchema = z.object({
  redirectUrl: z.string().url().or(z.literal("")).default(""),
  allowedDomains: z.array(z.string()).default([]),
  honeypotField: z.string().default("_gotcha"),
  spamThreshold: z.number().int().min(1).max(100).default(60),
  spamAction: z.enum(["flag", "reject"]).default("flag"),
  rateLimitPerMinute: z.number().int().min(1).max(10000).default(10),
  duplicateWindowMinutes: z.number().int().min(0).default(60),
  schemaMode: z.enum(["off", "validate", "strict"]).default("off"),
  fields: z.array(fieldDefSchema).default([]),
  fieldMapping: z.record(z.string(), z.string()).default({}),
  opensAt: z.string().nullable().default(null),
  closesAt: z.string().nullable().default(null),
  maxSubmissions: z.number().int().positive().nullable().default(null),
  closedMessage: z.string().default("This form is not accepting submissions right now."),
  notifyEmails: z.array(z.string().email()).default([]),
  notifyOnSpam: z.boolean().default(false),
  autoresponder: z
    .object({
      enabled: z.boolean().default(false),
      subject: z.string().default("Thanks — we got your message"),
      body: z.string().default("Hi {{name}},\n\nThanks for reaching out. We'll get back to you soon."),
    })
    .default({ enabled: false, subject: "Thanks — we got your message", body: "Hi {{name}},\n\nThanks for reaching out. We'll get back to you soon." }),
  enrichment: z
    .object({
      email: z.boolean().default(true),
      geo: z.boolean().default(true),
      userAgent: z.boolean().default(true),
      company: z.boolean().default(true),
      apollo: z.boolean().default(true),
      clay: z.boolean().default(true),
      valyu: z.boolean().default(true),
      ai: z.boolean().default(true),
      deepResearch: z.boolean().default(false),
      deepResearchMode: z.enum(["fast", "standard", "heavy", "max"]).default("fast"),
    })
    .default({ email: true, geo: true, userAgent: true, company: true, apollo: true, clay: true, valyu: true, ai: true, deepResearch: false, deepResearchMode: "fast" }),
});
export type FormSettings = z.infer<typeof formSettingsSchema>;

export const defaultSettings = (): FormSettings => formSettingsSchema.parse({});

export function normalizeSettings(input: unknown): FormSettings {
  const base = defaultSettings();
  const merged = { ...base, ...(typeof input === "object" && input ? input : {}) };
  const res = formSettingsSchema.safeParse(merged);
  return res.success ? res.data : base;
}

export interface FormRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: "active" | "paused";
  settings: FormSettings;
  createdAt: string;
  updatedAt: string;
}

export interface StoredFile {
  field: string;
  name: string;
  size: number;
  type: string;
  path: string;
}

export interface SubmissionMeta {
  ip: string | null;
  userAgent: string | null;
  referer: string | null;
  origin: string | null;
  contentType: string | null;
}

export interface SubmissionRecord {
  id: string;
  formId: string;
  workspaceId: string;
  data: Record<string, unknown>;
  fieldTypes: Record<string, FieldType>;
  files: StoredFile[];
  meta: SubmissionMeta;
  enrichment: Record<string, unknown>;
  spamScore: number;
  isSpam: boolean;
  spamReasons: string[];
  status: "new" | "read" | "archived";
  owner: string | null;
  tags: string[];
  routing: RoutingDecision | Record<string, never>;
  fitScore: number | null;
  enrichmentStatus: "pending" | "complete" | "partial" | "skipped";
  activity: ActivityEntry[];
  createdAt: string;
}

export interface ActivityEntry {
  at: string;
  type: string;
  message: string;
}

export interface RoutingStep {
  ruleId: string;
  name: string;
  matched: boolean;
  details: string[];
}

export interface RoutingDecision {
  evaluatedAt: string;
  steps: RoutingStep[];
  owner: string | null;
  tags: string[];
  matchedRules: string[];
}

export const SCOPES = [
  "forms:read",
  "forms:write",
  "submissions:read",
  "submissions:write",
  "automations:read",
  "automations:write",
] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_DESCRIPTIONS: Record<Scope, string> = {
  "forms:read": "List and read forms",
  "forms:write": "Create, update and delete forms",
  "submissions:read": "List, search and export submissions",
  "submissions:write": "Update and delete submissions",
  "automations:read": "Read webhooks, deliveries and schedules",
  "automations:write": "Manage webhooks and schedules",
};
