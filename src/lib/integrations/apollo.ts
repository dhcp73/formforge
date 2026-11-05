/** Typed wrapper around the Apollo.io REST API (no official TS SDK). */
export const APOLLO_BASE = process.env.APOLLO_BASE_URL || "https://api.apollo.io/api/v1";

export interface ApolloOrganization {
  id?: string; name?: string; website_url?: string; primary_domain?: string; linkedin_url?: string | null; logo_url?: string | null;
  industry?: string | null; estimated_num_employees?: number | null; annual_revenue?: number | null; annual_revenue_printed?: string | null;
  country?: string | null; city?: string | null; state?: string | null; short_description?: string | null; founded_year?: number | null;
}
export interface ApolloPerson {
  id?: string; name?: string; first_name?: string; last_name?: string; title?: string | null; seniority?: string | null;
  linkedin_url?: string | null; city?: string | null; country?: string | null; departments?: string[]; organization?: ApolloOrganization | null;
}

export class ApolloError extends Error { constructor(message: string, public status?: number) { super(message); } }

export class ApolloClient {
  constructor(private apiKey: string, private base = APOLLO_BASE) {}

  private async request<T>(path: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": this.apiKey, ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApolloError(`Apollo ${res.status}: ${body.slice(0, 200) || res.statusText}`, res.status);
    }
    return (await res.json()) as T;
  }

  health(signal?: AbortSignal) { return this.request<{ is_logged_in?: boolean; healthy?: boolean }>("/auth/health", { signal }); }

  matchPerson(params: { email?: string; name?: string; domain?: string; organization_name?: string }, signal?: AbortSignal) {
    return this.request<{ person: ApolloPerson | null }>("/people/match", { method: "POST", body: JSON.stringify({ ...params, reveal_personal_emails: false }), signal });
  }

  enrichOrganization(domain: string, signal?: AbortSignal) {
    return this.request<{ organization: ApolloOrganization | null }>(`/organizations/enrich?domain=${encodeURIComponent(domain)}`, { method: "GET", signal });
  }
}

/** Map Apollo payloads to FormForge flat enrichment fields. */
export function apolloToFields(person: ApolloPerson | null, org: ApolloOrganization | null): Record<string, unknown> {
  const o = org ?? person?.organization ?? null;
  return {
    "person.name": person?.name, "person.title": person?.title, "person.seniority": person?.seniority, "person.linkedin": person?.linkedin_url,
    "person.city": person?.city, "person.country": person?.country, "person.departments": person?.departments,
    "company.name": o?.name, "company.industry": o?.industry, "company.employees": o?.estimated_num_employees,
    "company.revenue": o?.annual_revenue, "company.revenuePrinted": o?.annual_revenue_printed, "company.country": o?.country,
    "company.city": o?.city, "company.linkedin": o?.linkedin_url, "company.logo": o?.logo_url, "company.description": o?.short_description,
    "company.foundedYear": o?.founded_year,
  };
}
