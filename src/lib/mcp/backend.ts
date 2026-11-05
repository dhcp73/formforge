/** Backend abstraction so the same MCP tools run in-process (HTTP endpoint) or over REST (stdio client). */
export interface FormForgeBackend {
  listForms(): Promise<unknown>;
  getForm(id: string): Promise<unknown>;
  createForm(input: { name: string; description?: string; settings?: Record<string, unknown> }): Promise<unknown>;
  listSubmissions(formId: string, q: Record<string, unknown>): Promise<unknown>;
  getSubmission(id: string): Promise<unknown>;
  searchSubmissions(q: string, formId?: string, limit?: number): Promise<unknown>;
  createWebhook(formId: string, input: { url: string; events?: string[]; include_spam?: boolean }): Promise<unknown>;
  enrichSubmission(id: string): Promise<unknown>;
  researchCompany(input: { domain?: string; company?: string; mode?: string; submission_id?: string }): Promise<unknown>;
  stats(): Promise<unknown>;
}

export function httpBackend(baseUrl: string, apiKey: string): FormForgeBackend {
  const base = baseUrl.replace(/\/$/, "") + "/api/v1";
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((j as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
    return j;
  };
  const qs = (o: Record<string, unknown>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v)); const s = p.toString(); return s ? `?${s}` : ""; };
  return {
    listForms: () => call("GET", "/forms"),
    getForm: (id) => call("GET", `/forms/${id}`),
    createForm: (input) => call("POST", "/forms", input),
    listSubmissions: (formId, q) => call("GET", `/forms/${formId}/submissions${qs(q)}`),
    getSubmission: (id) => call("GET", `/submissions/${id}`),
    searchSubmissions: (q, formId, limit) => call("GET", `/submissions${qs({ q, form_id: formId, limit })}`),
    createWebhook: (formId, input) => call("POST", `/forms/${formId}/webhooks`, input),
    enrichSubmission: (id) => call("POST", `/submissions/${id}/enrich`),
    researchCompany: (input) => call("POST", "/research", input),
    stats: () => call("GET", "/stats"),
  };
}
