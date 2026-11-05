/** Shared enrichment types. Every enricher produces a partial result plus flat, attributed fields. */
export type ProviderId = "apollo" | "clay" | "valyu" | "offline" | "ipgeo" | "ai" | "email" | "useragent";

/** Lower number wins when two providers supply the same field (waterfall). */
export const PROVIDER_PRIORITY: Record<ProviderId, number> = {
  apollo: 1, clay: 2, valyu: 3, offline: 4, ipgeo: 5, ai: 6, email: 0, useragent: 0,
};

export interface EnrichmentContext {
  workspaceId: string;
  submissionId?: string;
  data: Record<string, unknown>;
  email: string | null;
  domain: string | null;
  companyName: string | null;
  ip: string | null;
  userAgent: string | null;
}

export interface EnricherResult {
  /** Flat dotted paths (e.g. "company.employees") → value */
  fields: Record<string, unknown>;
  /** Raw provider payload / extra info stored under enrichment.providers[id] */
  raw?: unknown;
  credits?: number;
  costUsd?: number;
}

export interface Enricher {
  id: ProviderId;
  label: string;
  /** Inline enrichers run during ingest (must be fast + offline-safe). Others run in the background job. */
  stage: "inline" | "async";
  timeoutMs: number;
  isEnabled(ctx: EnrichmentContext): boolean | Promise<boolean>;
  run(ctx: EnrichmentContext, signal: AbortSignal): Promise<EnricherResult | null>;
}

export interface ProviderOutcome {
  status: "success" | "error" | "timeout" | "skipped" | "cache_hit" | "no_data" | "pending";
  ms: number;
  message?: string;
  raw?: unknown;
}

export interface Enrichment {
  email?: Record<string, unknown>;
  geo?: Record<string, unknown>;
  userAgent?: Record<string, unknown>;
  company?: Record<string, unknown>;
  person?: Record<string, unknown>;
  ai?: Record<string, unknown>;
  research?: Record<string, unknown>;
  fitScore?: number;
  attribution: Record<string, ProviderId>;
  providers: Partial<Record<ProviderId, ProviderOutcome>>;
  [k: string]: unknown;
}
