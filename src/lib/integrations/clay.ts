/** Clay has no SDK: we push leads to a Clay table webhook and accept enriched rows back on a signed callback. */
export interface ClayOutbound {
  submission_id: string; workspace_id: string; form_id: string; email: string | null; domain: string | null; company: string | null;
  fields: Record<string, unknown>; callback_url: string; callback_header: string;
}

export async function sendToClay(webhookUrl: string, payload: ClayOutbound | Record<string, unknown>, signal?: AbortSignal) {
  const res = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal });
  if (!res.ok) throw new Error(`Clay webhook responded ${res.status}`);
  return res.status;
}

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

/** Accepts flat Clay column names (snake/camel/Title) or a nested `enrichment` object. */
export function clayToFields(body: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const src = { ...body, ...((body.enrichment as Record<string, unknown>) ?? {}) };
  for (const [k, v] of Object.entries(src)) flat[k.toLowerCase().replace(/[\s-]+/g, "_")] = v;
  const num = (v: unknown) => (v == null || v === "" ? undefined : Number.isFinite(Number(String(v).replace(/[, ]/g, ""))) ? Number(String(v).replace(/[, ]/g, "")) : undefined);
  return {
    "company.name": pick(flat, "company_name", "company", "organization"),
    "company.domain": pick(flat, "company_domain", "domain"),
    "company.industry": pick(flat, "industry", "company_industry"),
    "company.employees": num(pick(flat, "employees", "employee_count", "company_size", "headcount")),
    "company.revenue": num(pick(flat, "revenue", "annual_revenue")),
    "company.country": pick(flat, "country", "hq_country", "company_country"),
    "company.city": pick(flat, "city", "hq_city", "company_city"),
    "company.linkedin": pick(flat, "company_linkedin", "linkedin_company_url", "company_linkedin_url"),
    "company.description": pick(flat, "company_description", "description"),
    "person.title": pick(flat, "title", "job_title"),
    "person.seniority": pick(flat, "seniority"),
    "person.linkedin": pick(flat, "linkedin", "linkedin_url", "person_linkedin"),
    "person.name": pick(flat, "full_name", "person_name"),
  };
}
