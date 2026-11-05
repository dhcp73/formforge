import type { SubmissionRecord } from "./types";
import { displayName } from "./format";

export interface TableRow {
  id: string; formId: string; formName?: string; createdAt: string; name: string; email: string | null;
  data: Record<string, string>; company: string | null; domain: string | null; employees: number | null; industry: string | null; country: string | null;
  fitScore: number | null; owner: string | null; tags: string[]; sources: string[]; spamScore: number; isSpam: boolean; status: string; enrichmentStatus: string;
}

export function toTableRow(s: SubmissionRecord, formName?: string): TableRow {
  const e = s.enrichment as { company?: Record<string, unknown>; geo?: Record<string, unknown>; email?: Record<string, unknown>; attribution?: Record<string, string> };
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.data)) data[k] = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v).slice(0, 300);
  const sources = Array.from(new Set(Object.values(e.attribution ?? {}))).filter((x) => !["email", "useragent"].includes(x));
  return {
    id: s.id, formId: s.formId, formName, createdAt: s.createdAt, name: displayName(s), email: (e.email?.address as string) ?? null, data,
    company: (e.company?.name as string) ?? null, domain: (e.company?.domain as string) ?? null, employees: (e.company?.employees as number) ?? null,
    industry: (e.company?.industry as string) ?? null, country: (e.geo?.country as string) ?? null, fitScore: s.fitScore, owner: s.owner, tags: s.tags,
    sources, spamScore: s.spamScore, isSpam: s.isSpam, status: s.status, enrichmentStatus: s.enrichmentStatus,
  };
}
