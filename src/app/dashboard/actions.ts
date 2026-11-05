"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireSession } from "@/lib/session";
import { switchWorkspace, createWorkspace, renameWorkspace, updateProfile, changePassword, AuthError } from "@/lib/auth";
import { createForm, updateForm, deleteForm, getForm } from "@/lib/forms";
import { updateSubmission, deleteSubmission, getSubmission } from "@/lib/submissions";
import { reenrichSubmission } from "@/lib/processing";
import { createWebhook, updateWebhook, deleteWebhook, getWebhook, createDelivery, attemptDelivery, getDelivery } from "@/lib/webhooks";
import { createSchedule, updateSchedule, deleteSchedule, getSchedule, runSchedule } from "@/lib/schedules";
import { createRule, updateRule, deleteRule, getRule } from "@/lib/routing";
import { createApiKey, revokeApiKey, rotateApiKey, sanitizeScopes } from "@/lib/apikeys";
import { saveProvider, resolveProvider } from "@/lib/integrations/store";
import { testIntegration } from "@/lib/enrich/pipeline";
import { INTEGRATIONS, type IntegrationId } from "@/lib/integrations/registry";
import { runMonitorOnce } from "@/lib/monitor";
import { enqueueJob } from "@/lib/jobs";
import { getDb, now, isEphemeralMode } from "@/lib/db";
import { persistDemoSnapCookie } from "@/lib/demo-cookie";
import { newId } from "@/lib/ids";
import type { ActionState } from "@/components/ui/action-form";
import { fieldDefSchema } from "@/lib/types";

async function ctx() { const s = await requireSession(); return { s, ws: s.workspace.id }; }
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const list = (v: string) => v.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(e: unknown): ActionState {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of e.issues) fieldErrors[String(i.path[i.path.length - 1] ?? "_")] = i.message;
    return { error: e.issues.map((i) => i.message).join(" · "), fieldErrors };
  }
  return { error: e instanceof Error ? e.message : String(e) };
}

// ---------- workspace ----------
export async function switchWorkspaceAction(id: string) {
  const { s } = await ctx();
  const { setSessionCookie } = await import("@/lib/session");
  await setSessionCookie(switchWorkspace(s.user.id, id));
  redirect("/dashboard");
}
export async function createWorkspaceAction(fd: FormData) {
  const { s } = await ctx();
  const name = str(fd, "name");
  if (name.length < 2) return;
  const id = createWorkspace(s.user.id, name);
  const { setSessionCookie } = await import("@/lib/session");
  await setSessionCookie(switchWorkspace(s.user.id, id));
  redirect("/dashboard");
}

// ---------- forms ----------
export async function createFormAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ws } = await ctx();
  const name = str(fd, "name");
  if (!name) return { error: "Please name your form.", fieldErrors: { name: "Form name is required" } };
  const redirectUrl = str(fd, "redirectUrl");
  if (redirectUrl && !/^https?:\/\/.+/.test(redirectUrl)) return { error: "Redirect URL must start with http(s)://", fieldErrors: { redirectUrl: "Enter a full URL, e.g. https://example.com/thanks" } };
  const emails = list(str(fd, "notifyEmails"));
  const bad = emails.find((e) => !EMAIL.test(e));
  if (bad) return { error: `"${bad}" is not a valid email`, fieldErrors: { notifyEmails: `"${bad}" is not a valid email` } };
  let id: string;
  let form;
  try { form = createForm(ws, { name, description: str(fd, "description"), settings: { redirectUrl, notifyEmails: emails } }); } catch (e) { return fail(e); }
  const id = form.id;
  if (isEphemeralMode()) await persistDemoSnapCookie();
  revalidatePath("/dashboard", "layout");
  // Browser/demo mode: return form so the client merges into localStorage before navigate
  // (avoids losing the row when the next request hits another serverless instance).
  if (isEphemeralMode()) {
    return {
      ok: true,
      message: "Form created.",
      data: {
        id,
        form: {
          id: form.id, workspace_id: form.workspaceId, name: form.name, description: form.description,
          status: form.status, settings: JSON.stringify(form.settings), created_at: form.createdAt, updated_at: form.updatedAt,
        },
      },
    };
  }
  redirect(`/dashboard/forms/${id}/setup?created=1`);
}

async function patchSettings(formId: string, settings: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<ActionState> {
  const { ws } = await ctx();
  if (!getForm(ws, formId)) return { error: "Form not found" };
  try { updateForm(ws, formId, { ...extra, settings }); } catch (e) { return fail(e); }
  revalidatePath(`/dashboard/forms/${formId}`, "layout");
  return { ok: true, message: "Saved." };
}

export async function saveGeneralAction(formId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const name = str(fd, "name");
  if (!name) return { error: "Form name is required.", fieldErrors: { name: "Form name is required" } };
  const redirectUrl = str(fd, "redirectUrl");
  if (redirectUrl && !/^https?:\/\/.+\..+/.test(redirectUrl)) return { error: "Redirect URL must be a full http(s) URL.", fieldErrors: { redirectUrl: "Enter a full URL, e.g. https://example.com/thanks" } };
  const domains = list(str(fd, "allowedDomains"));
  const badDomain = domains.find((d) => !/^(\*\.)?[a-z0-9.-]+\.[a-z]{2,}$|^localhost$/i.test(d.replace(/^https?:\/\//, "").replace(/\/.*$/, "")));
  if (badDomain) return { error: `"${badDomain}" is not a valid domain`, fieldErrors: { allowedDomains: `"${badDomain}" is not a valid domain (e.g. example.com or *.example.com)` } };
  const honeypotField = str(fd, "honeypotField") || "_gotcha";
  return patchSettings(formId, { redirectUrl, allowedDomains: domains, honeypotField }, { name, description: str(fd, "description"), status: fd.get("active") === "on" ? "active" : "paused" });
}

export async function saveSpamAction(formId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const threshold = Number(str(fd, "spamThreshold"));
  const rate = Number(str(fd, "rateLimitPerMinute"));
  const dup = Number(str(fd, "duplicateWindowMinutes"));
  const fe: Record<string, string> = {};
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) fe.spamThreshold = "Enter a whole number between 1 and 100";
  if (!Number.isInteger(rate) || rate < 1 || rate > 10000) fe.rateLimitPerMinute = "Enter a whole number between 1 and 10000";
  if (!Number.isInteger(dup) || dup < 0) fe.duplicateWindowMinutes = "Enter 0 or more minutes";
  if (Object.keys(fe).length) return { error: "Please fix the highlighted fields.", fieldErrors: fe };
  return patchSettings(formId, { spamThreshold: threshold, rateLimitPerMinute: rate, duplicateWindowMinutes: dup, spamAction: str(fd, "spamAction") === "reject" ? "reject" : "flag" });
}

export async function saveScheduleWindowAction(formId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const tz = str(fd, "tzOffset");
  const toIso = (v: string) => (v ? new Date(`${v}${tz || "Z"}`).toISOString() : null);
  const opens = str(fd, "opensAt");
  const closes = str(fd, "closesAt");
  const cap = str(fd, "maxSubmissions");
  const fe: Record<string, string> = {};
  if (opens && Number.isNaN(Date.parse(opens))) fe.opensAt = "Invalid date";
  if (closes && Number.isNaN(Date.parse(closes))) fe.closesAt = "Invalid date";
  if (opens && closes && Date.parse(closes) <= Date.parse(opens)) fe.closesAt = "Close time must be after open time";
  if (cap && (!/^\d+$/.test(cap) || Number(cap) < 1)) fe.maxSubmissions = "Enter a positive whole number or leave empty";
  if (Object.keys(fe).length) return { error: "Please fix the highlighted fields.", fieldErrors: fe };
  return patchSettings(formId, { opensAt: toIso(opens), closesAt: toIso(closes), maxSubmissions: cap ? Number(cap) : null, closedMessage: str(fd, "closedMessage") || "This form is not accepting submissions right now." });
}

export async function saveNotificationsAction(formId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const emails = list(str(fd, "notifyEmails"));
  const bad = emails.find((e) => !EMAIL.test(e));
  if (bad) return { error: `"${bad}" is not a valid email`, fieldErrors: { notifyEmails: `"${bad}" is not a valid email` } };
  const enabled = fd.get("autoresponderEnabled") === "on";
  if (enabled && !str(fd, "autoresponderSubject")) return { error: "Autoresponder needs a subject.", fieldErrors: { autoresponderSubject: "Subject is required when the autoresponder is on" } };
  return patchSettings(formId, { notifyEmails: emails, notifyOnSpam: fd.get("notifyOnSpam") === "on", autoresponder: { enabled, subject: str(fd, "autoresponderSubject") || "Thanks — we got your message", body: str(fd, "autoresponderBody") || "Thanks for reaching out." } });
}

export async function saveFieldsAction(formId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let fields: unknown[];
  try { fields = JSON.parse(str(fd, "fields") || "[]"); } catch { return { error: "Invalid field definitions" }; }
  const parsed = [];
  for (const [i, f] of fields.entries()) {
    const r = fieldDefSchema.safeParse(f);
    if (!r.success) return { error: `Field #${i + 1}: ${r.error.issues[0].message}` };
    if (r.data.pattern) { try { new RegExp(r.data.pattern); } catch { return { error: `Field "${r.data.name}": invalid regex pattern` }; } }
    parsed.push(r.data);
  }
  const names = parsed.map((f) => f.name);
  const dupe = names.find((n, i) => names.indexOf(n) !== i);
  if (dupe) return { error: `Duplicate field name "${dupe}"` };
  const mapping: Record<string, string> = {};
  for (const line of str(fd, "fieldMapping").split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [from, to] = line.split(/\s*(?:=>|->|:)\s*/);
    if (!from || !to) return { error: `Mapping line "${line}" must look like old_name => new_name`, fieldErrors: { fieldMapping: `"${line}" must look like old_name => new_name` } };
    mapping[from] = to;
  }
  const mode = str(fd, "schemaMode");
  return patchSettings(formId, { fields: parsed, fieldMapping: mapping, schemaMode: mode === "validate" || mode === "strict" ? mode : "off" });
}

export async function saveEnrichmentSettingsAction(formId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const on = (k: string) => fd.get(k) === "on";
  const mode = str(fd, "deepResearchMode");
  return patchSettings(formId, { enrichment: { email: on("email"), geo: on("geo"), userAgent: on("userAgent"), company: on("company"), apollo: on("apollo"), clay: on("clay"), valyu: on("valyu"), ai: on("ai"), deepResearch: on("deepResearch"), deepResearchMode: ["fast", "standard", "heavy", "max"].includes(mode) ? mode : "fast" } });
}

export async function deleteFormAction(formId: string) {
  const { ws } = await ctx();
  deleteForm(ws, formId);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/forms");
}

// ---------- submissions ----------
export async function bulkSubmissionsAction(ids: string[], action: "read" | "new" | "archived" | "spam" | "not_spam" | "delete"): Promise<ActionState> {
  const { ws } = await ctx();
  let n = 0;
  for (const id of ids.slice(0, 500)) {
    if (!getSubmission(ws, id)) continue;
    if (action === "delete") deleteSubmission(ws, id);
    else if (action === "spam" || action === "not_spam") updateSubmission(ws, id, { isSpam: action === "spam" });
    else updateSubmission(ws, id, { status: action });
    n++;
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `${n} submission${n === 1 ? "" : "s"} updated.` };
}
export async function setOwnerAction(id: string, owner: string): Promise<ActionState> {
  const { ws } = await ctx();
  updateSubmission(ws, id, { owner: owner.trim() || null });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Owner updated." };
}
export async function reenrichAction(id: string): Promise<ActionState> {
  const { ws } = await ctx();
  try { await reenrichSubmission(ws, id); } catch (e) { return fail(e); }
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Re-enriched and re-routed." };
}

// ---------- webhooks ----------
export async function createWebhookAction(formId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { ws } = await ctx();
  const url = str(fd, "url");
  if (!/^https?:\/\/.+/.test(url)) return { error: "Enter a valid http(s) URL.", fieldErrors: { url: "Enter a valid http(s) URL, e.g. https://example.com/hooks/formforge" } };
  const events = fd.getAll("events").map(String);
  try { createWebhook(ws, formId, { url, events: events.length ? events : ["submission.created"], includeSpam: fd.get("includeSpam") === "on" }); } catch (e) { return fail(e); }
  revalidatePath(`/dashboard/forms/${formId}`, "layout");
  revalidatePath("/dashboard/webhooks");
  return { ok: true, message: "Webhook created." };
}
export async function toggleWebhookAction(id: string, active: boolean) {
  const { ws } = await ctx();
  const h = getWebhook(ws, id);
  if (h) updateWebhook(ws, id, { active });
  revalidatePath("/dashboard", "layout");
}
export async function deleteWebhookAction(id: string) {
  const { ws } = await ctx();
  deleteWebhook(ws, id);
  revalidatePath("/dashboard", "layout");
}
export async function testWebhookAction(id: string): Promise<ActionState> {
  const { ws } = await ctx();
  const h = getWebhook(ws, id);
  if (!h) return { error: "Webhook not found" };
  const dId = createDelivery(h, "webhook.test", { event: "webhook.test", created_at: now(), message: "Test event from FormForge" }, null);
  const r = await attemptDelivery(dId);
  const d = getDelivery(ws, dId)!;
  revalidatePath("/dashboard", "layout");
  return r.result === "success" ? { ok: true, message: `Delivered (HTTP ${d.response_status}, ${d.duration_ms} ms).` } : { error: `Delivery failed: ${d.error ?? `HTTP ${d.response_status}`}. ${r.result === "retry" ? "Retries scheduled." : ""}` };
}
export async function redeliverAction(deliveryId: string): Promise<ActionState> {
  const { ws } = await ctx();
  const d = getDelivery(ws, deliveryId);
  if (!d) return { error: "Delivery not found" };
  const h = getWebhook(ws, d.webhook_id);
  if (!h) return { error: "Webhook was deleted" };
  const id = createDelivery(h, d.event, JSON.parse(d.payload), d.submission_id);
  enqueueJob("webhook.deliver", { deliveryId: id });
  revalidatePath("/dashboard/webhooks");
  return { ok: true, message: "Redelivery queued." };
}

// ---------- schedules ----------
export async function createScheduleAction(formId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { ws } = await ctx();
  const kind = str(fd, "kind");
  const preset = str(fd, "preset");
  const cron = preset === "custom" ? str(fd, "cron") : preset;
  const recipients = list(str(fd, "recipients"));
  const bad = recipients.find((e) => !EMAIL.test(e));
  if (bad) return { error: `"${bad}" is not a valid email`, fieldErrors: { recipients: `"${bad}" is not a valid email` } };
  try {
    createSchedule(ws, formId, { name: str(fd, "name") || "Schedule", kind, cron, timezone: str(fd, "timezone") || "UTC", config: { recipients: recipients.length ? recipients : undefined, url: str(fd, "url") || undefined } });
  } catch (e) { return fail(e); }
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Schedule created." };
}
export async function runScheduleAction(id: string): Promise<ActionState> {
  const { ws } = await ctx();
  if (!getSchedule(ws, id)) return { error: "Schedule not found" };
  const r = await runSchedule(id);
  revalidatePath("/dashboard", "layout");
  return r.status === "success" ? { ok: true, message: r.detail } : { error: r.detail };
}
export async function toggleScheduleAction(id: string, active: boolean) {
  const { ws } = await ctx();
  if (getSchedule(ws, id)) updateSchedule(ws, id, { active });
  revalidatePath("/dashboard", "layout");
}
export async function deleteScheduleAction(id: string) {
  const { ws } = await ctx();
  deleteSchedule(ws, id);
  revalidatePath("/dashboard", "layout");
}

// ---------- routing ----------
export async function saveRuleAction(ruleId: string | null, payload: unknown): Promise<ActionState> {
  const { ws } = await ctx();
  try {
    if (ruleId) { if (!getRule(ws, ruleId)) return { error: "Rule not found" }; updateRule(ws, ruleId, payload); }
    else createRule(ws, payload);
  } catch (e) { return fail(e); }
  revalidatePath("/dashboard/routing");
  return { ok: true, message: ruleId ? "Rule updated." : "Rule created." };
}
export async function toggleRuleAction(id: string, active: boolean) {
  const { ws } = await ctx();
  if (getRule(ws, id)) updateRule(ws, id, { active });
  revalidatePath("/dashboard/routing");
}
export async function deleteRuleAction(id: string) {
  const { ws } = await ctx();
  deleteRule(ws, id);
  revalidatePath("/dashboard/routing");
}

// ---------- API keys ----------
export async function createKeyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { s, ws } = await ctx();
  const name = str(fd, "name");
  const scopes = sanitizeScopes(fd.getAll("scopes").map(String));
  const fe: Record<string, string> = {};
  if (!name) fe.name = "Give the key a name so you can recognise it later";
  if (!scopes.length) fe.scopes = "Select at least one scope";
  if (Object.keys(fe).length) return { error: "Please fix the highlighted fields.", fieldErrors: fe };
  const expiresDays = Number(str(fd, "expiresDays"));
  const expiresAt = expiresDays > 0 ? new Date(Date.now() + expiresDays * 864e5).toISOString() : null;
  const { key, record } = createApiKey(ws, name, scopes, s.user.id, expiresAt);
  revalidatePath("/dashboard/api-keys");
  return { ok: true, message: "Key created. Copy it now — it won't be shown again.", data: { key, prefix: record.prefix } };
}
export async function revokeKeyAction(id: string) {
  const { ws } = await ctx();
  revokeApiKey(ws, id);
  revalidatePath("/dashboard/api-keys");
}
export async function rotateKeyAction(id: string): Promise<ActionState> {
  const { s, ws } = await ctx();
  try {
    const { key, record } = rotateApiKey(ws, id, s.user.id);
    revalidatePath("/dashboard/api-keys");
    return { ok: true, message: "Key rotated. The old key no longer works.", data: { key, prefix: record.prefix } };
  } catch (e) { return fail(e); }
}

// ---------- integrations ----------
export async function saveIntegrationAction(provider: IntegrationId, _: ActionState, fd: FormData): Promise<ActionState> {
  const { ws } = await ctx();
  const def = INTEGRATIONS.find((i) => i.id === provider);
  if (!def) return { error: "Unknown provider" };
  const config: Record<string, string | boolean> = {};
  for (const f of def.fields) config[f.key] = f.type === "boolean" ? fd.get(f.key) === "on" : str(fd, f.key);
  const fe: Record<string, string> = {};
  for (const f of def.fields) {
    const v = config[f.key];
    if (f.type === "url" && v && !/^https?:\/\//.test(String(v))) fe[f.key] = "Must be a full https:// URL";
    if (f.key === "webhookUrl" && v && !String(v).includes("••••") && !/^https?:\/\//.test(String(v))) fe[f.key] = "Must be a full https:// URL";
  }
  if (Object.keys(fe).length) return { error: "Please fix the highlighted fields.", fieldErrors: fe };
  const r = saveProvider(ws, provider, { enabled: fd.get("enabled") === "on", config });
  revalidatePath("/dashboard/integrations");
  if (fd.get("enabled") === "on" && !r.configured) return { ok: true, message: `Saved, but ${def.label} stays disabled until a key is provided.` };
  return { ok: true, message: `${def.label} settings saved${r.enabled ? " and enabled" : ""}.` };
}
export async function testIntegrationAction(provider: IntegrationId): Promise<ActionState> {
  const { ws } = await ctx();
  const r = await testIntegration(ws, provider);
  revalidatePath("/dashboard/integrations");
  return r.ok ? { ok: true, message: r.message } : { error: r.message };
}
export async function toggleIntegrationAction(provider: IntegrationId, enabled: boolean): Promise<ActionState> {
  const { ws } = await ctx();
  const r = saveProvider(ws, provider, { enabled });
  revalidatePath("/dashboard/integrations");
  if (enabled && !r.configured) return { error: "Add an API key first — the provider stays disabled without one." };
  return { ok: true, message: enabled ? "Enabled." : "Disabled." };
}
export async function integrationStatus(provider: IntegrationId) { const { ws } = await ctx(); return resolveProvider(ws, provider).enabled; }

// ---------- settings ----------
export async function saveProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { s } = await ctx();
  const name = str(fd, "name");
  if (!name) return { error: "Name is required.", fieldErrors: { name: "Name is required" } };
  updateProfile(s.user.id, name);
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Profile updated." };
}
export async function saveWorkspaceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ws } = await ctx();
  const name = str(fd, "workspaceName");
  if (name.length < 2) return { error: "Workspace name is too short.", fieldErrors: { workspaceName: "Use at least 2 characters" } };
  renameWorkspace(ws, name);
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Workspace renamed." };
}
export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { s } = await ctx();
  const next = str(fd, "newPassword");
  if (next !== str(fd, "confirmPassword")) return { error: "Passwords don't match.", fieldErrors: { confirmPassword: "Passwords don't match" } };
  try { changePassword(s.user.id, String(fd.get("currentPassword") ?? ""), next); } catch (e) {
    const msg = e instanceof AuthError ? e.message : "Could not change password";
    return { error: msg, fieldErrors: /current/i.test(msg) ? { currentPassword: msg } : { newPassword: msg } };
  }
  return { ok: true, message: "Password changed." };
}

// ---------- operations ----------
export async function runMonitorAction(): Promise<ActionState> {
  await ctx();
  const r = await runMonitorOnce();
  revalidatePath("/dashboard/health");
  const down = r.filter((x) => x.status === "down").length;
  return down ? { error: `${down} component(s) down — see details below.` } : { ok: true, message: `All ${r.length} checks completed.` };
}
export async function runQaAction(): Promise<ActionState> {
  await ctx();
  const id = newId("qa");
  getDb().prepare("INSERT INTO qa_runs (id, status, started_at) VALUES (?, 'queued', ?)").run(id, now());
  enqueueJob("qa.run", { runId: id });
  revalidatePath("/dashboard/qa");
  return { ok: true, message: "QA run queued — results appear here when it finishes (1–3 min)." };
}

// ---------- calendar / email OAuth ----------
export async function saveCalendarAppConfigAction(provider: "google" | "microsoft", _: ActionState, fd: FormData): Promise<ActionState> {
  const { ws } = await ctx();
  const { saveAppConfig } = await import("@/lib/calendar");
  const clientId = str(fd, "clientId");
  const clientSecret = str(fd, "clientSecret");
  const tenant = str(fd, "tenant") || "common";
  if (!clientId) return { error: "Client ID is required.", fieldErrors: { clientId: "Required" } };
  if (!clientSecret || clientSecret.includes("••••")) {
    // allow updating id only when secret already stored — require secret on first save
    const { getAppConfig } = await import("@/lib/calendar");
    if (!getAppConfig(ws, provider)?.clientSecret && !((provider === "google" ? process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_SECRET))) {
      return { error: "Client secret is required.", fieldErrors: { clientSecret: "Required" } };
    }
  }
  const payload: { clientId: string; clientSecret?: string; tenant?: string } = { clientId };
  if (clientSecret && !clientSecret.includes("••••")) payload.clientSecret = clientSecret;
  else {
    const { getAppConfig } = await import("@/lib/calendar");
    const prev = getAppConfig(ws, provider);
    if (prev?.clientSecret) payload.clientSecret = prev.clientSecret;
  }
  if (provider === "microsoft") payload.tenant = tenant;
  saveAppConfig(ws, provider, payload as { clientId: string; clientSecret: string; tenant?: string });
  revalidatePath("/dashboard/integrations");
  return { ok: true, message: `${provider === "google" ? "Google" : "Microsoft"} OAuth app saved.` };
}

export async function disconnectCalendarAction(provider: "google" | "microsoft"): Promise<ActionState> {
  const { s, ws } = await ctx();
  const { deleteConnection } = await import("@/lib/calendar");
  deleteConnection(ws, s.user.id, provider);
  revalidatePath("/dashboard/integrations");
  return { ok: true, message: "Disconnected." };
}
