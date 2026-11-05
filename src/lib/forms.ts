import { getDb, now, parseJson } from "./db";
import { newFormId } from "./ids";
import { defaultSettings, formSettingsSchema, normalizeSettings, type FormRecord, type FormSettings } from "./types";

type Row = { id: string; workspace_id: string; name: string; description: string; status: string; settings: string; created_at: string; updated_at: string };

export const mapForm = (r: Row): FormRecord => ({
  id: r.id, workspaceId: r.workspace_id, name: r.name, description: r.description,
  status: r.status === "paused" ? "paused" : "active", settings: normalizeSettings(parseJson(r.settings, {})),
  createdAt: r.created_at, updatedAt: r.updated_at,
});

export function createForm(workspaceId: string, input: { name: string; description?: string; settings?: Partial<FormSettings> }): FormRecord {
  const name = input.name?.trim();
  if (!name) throw new Error("Form name is required.");
  const settings = formSettingsSchema.parse({ ...defaultSettings(), ...(input.settings ?? {}) });
  const id = newFormId();
  const ts = now();
  getDb()
    .prepare("INSERT INTO forms (id, workspace_id, name, description, status, settings, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)")
    .run(id, workspaceId, name, input.description?.trim() ?? "", JSON.stringify(settings), ts, ts);
  return getForm(workspaceId, id)!;
}

export function getForm(workspaceId: string, id: string): FormRecord | null {
  const r = getDb().prepare("SELECT * FROM forms WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as Row | undefined;
  return r ? mapForm(r) : null;
}

/** Public lookup (ingest endpoint) — no workspace scoping. */
export function getFormPublic(id: string): FormRecord | null {
  const r = getDb().prepare("SELECT * FROM forms WHERE id = ?").get(id) as Row | undefined;
  return r ? mapForm(r) : null;
}

export interface FormWithStats extends FormRecord { submissionCount: number; spamCount: number; lastSubmissionAt: string | null }

export function listForms(workspaceId: string): FormWithStats[] {
  const rows = getDb()
    .prepare(
      `SELECT f.*, 
        (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id AND s.is_spam = 0) AS sc,
        (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id AND s.is_spam = 1) AS spc,
        (SELECT MAX(created_at) FROM submissions s WHERE s.form_id = f.id) AS last
       FROM forms f WHERE f.workspace_id = ? ORDER BY f.created_at DESC`,
    )
    .all(workspaceId) as (Row & { sc: number; spc: number; last: string | null })[];
  return rows.map((r) => ({ ...mapForm(r), submissionCount: r.sc, spamCount: r.spc, lastSubmissionAt: r.last }));
}

export function updateForm(workspaceId: string, id: string, patch: { name?: string; description?: string; status?: "active" | "paused"; settings?: Partial<FormSettings> }): FormRecord {
  const form = getForm(workspaceId, id);
  if (!form) throw new Error("Form not found");
  const settings = patch.settings ? formSettingsSchema.parse({ ...form.settings, ...patch.settings }) : form.settings;
  const name = patch.name !== undefined ? patch.name.trim() : form.name;
  if (!name) throw new Error("Form name is required.");
  getDb()
    .prepare("UPDATE forms SET name = ?, description = ?, status = ?, settings = ?, updated_at = ? WHERE id = ? AND workspace_id = ?")
    .run(name, patch.description ?? form.description, patch.status ?? form.status, JSON.stringify(settings), now(), id, workspaceId);
  return getForm(workspaceId, id)!;
}

export function deleteForm(workspaceId: string, id: string): boolean {
  return getDb().prepare("DELETE FROM forms WHERE id = ? AND workspace_id = ?").run(id, workspaceId).changes > 0;
}

/** Whether a form accepts submissions right now (status, schedule window, cap). */
export function formAvailability(form: FormRecord, count?: number, at = new Date()): { open: boolean; reason?: "paused" | "not_open_yet" | "closed" | "cap_reached" } {
  if (form.status === "paused") return { open: false, reason: "paused" };
  const s = form.settings;
  if (s.opensAt && at < new Date(s.opensAt)) return { open: false, reason: "not_open_yet" };
  if (s.closesAt && at > new Date(s.closesAt)) return { open: false, reason: "closed" };
  if (s.maxSubmissions) {
    const c = count ?? (getDb().prepare("SELECT COUNT(*) AS c FROM submissions WHERE form_id = ? AND is_spam = 0").get(form.id) as { c: number }).c;
    if (c >= s.maxSubmissions) return { open: false, reason: "cap_reached" };
  }
  return { open: true };
}
