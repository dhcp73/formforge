import { getDb, now } from "../db";
import { randomString } from "../ids";
import { decrypt, encrypt, maskSecret } from "../secrets";
import { INTEGRATIONS, integrationDef, type IntegrationId } from "./registry";

export type ProviderConfig = Record<string, string | boolean | undefined>;
export interface ResolvedProvider {
  id: IntegrationId;
  enabled: boolean;
  configured: boolean;
  source: "workspace" | "env" | null;
  config: ProviderConfig;
}

type Row = { workspace_id: string; provider: string; enabled: number; config_enc: string | null; last_tested_at: string | null; last_test_ok: number | null; last_test_message: string | null };

function readRow(ws: string, id: IntegrationId): Row | undefined {
  return getDb().prepare("SELECT * FROM integrations WHERE workspace_id = ? AND provider = ?").get(ws, id) as Row | undefined;
}

function decryptConfig(row?: Row): ProviderConfig {
  if (!row?.config_enc) return {};
  try { return JSON.parse(decrypt(row.config_enc)); } catch { return {}; }
}

/**
 * Resolution order per field: workspace value → env var → field default.
 * Workspace row's `enabled` flag wins; with no row, a provider configured purely via env is enabled.
 */
export function resolveProvider(ws: string, id: IntegrationId): ResolvedProvider {
  const def = integrationDef(id);
  const row = readRow(ws, id);
  const stored = decryptConfig(row);
  const config: ProviderConfig = {};
  let usedEnv = false;
  for (const f of def.fields) {
    const v = stored[f.key];
    if (v !== undefined && v !== "") config[f.key] = v;
    else if (f.env && process.env[f.env]) { config[f.key] = process.env[f.env]; if (f.key === def.keyField) usedEnv = true; }
    else if (f.default !== undefined) config[f.key] = f.default;
  }
  const configured = def.keyField ? !!config[def.keyField] : true;
  const enabled = configured && (row ? !!row.enabled : usedEnv || !def.keyField);
  return { id, enabled, configured, source: configured ? (usedEnv && !stored[def.keyField!] ? "env" : "workspace") : null, config };
}

export function saveProvider(ws: string, id: IntegrationId, input: { enabled?: boolean; config?: ProviderConfig }) {
  const def = integrationDef(id);
  const row = readRow(ws, id);
  const current = decryptConfig(row);
  const next: ProviderConfig = { ...current };
  for (const f of def.fields) {
    if (!input.config || !(f.key in input.config)) continue;
    const v = input.config[f.key];
    // keep existing secret when the masked placeholder / empty string is submitted
    if (f.type === "secret" && (v === "" || (typeof v === "string" && v.includes("••••")))) continue;
    next[f.key] = typeof v === "string" ? v.trim() : v;
  }
  for (const f of def.fields) if (f.generated && !next[f.key]) next[f.key] = `ffcs_${randomString(32)}`;
  const enabled = input.enabled ?? (row ? !!row.enabled : true);
  getDb()
    .prepare(`INSERT INTO integrations (workspace_id, provider, enabled, config_enc, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, provider) DO UPDATE SET enabled = excluded.enabled, config_enc = excluded.config_enc, updated_at = excluded.updated_at`)
    .run(ws, id, enabled ? 1 : 0, encrypt(JSON.stringify(next)), now());
  return resolveProvider(ws, id);
}

export function recordTest(ws: string, id: IntegrationId, ok: boolean, message: string) {
  if (!readRow(ws, id)) saveProvider(ws, id, {});
  getDb().prepare("UPDATE integrations SET last_tested_at = ?, last_test_ok = ?, last_test_message = ? WHERE workspace_id = ? AND provider = ?").run(now(), ok ? 1 : 0, message.slice(0, 500), ws, id);
}

/** Safe view for UI/API: secrets masked. */
export function listIntegrationsView(ws: string) {
  return INTEGRATIONS.map((def) => {
    const r = resolveProvider(ws, def.id);
    const row = readRow(ws, def.id);
    const values: Record<string, string | boolean> = {};
    for (const f of def.fields) {
      const v = r.config[f.key];
      values[f.key] = f.type === "secret" ? maskSecret(typeof v === "string" ? v : "") : (v ?? "");
    }
    return {
      id: def.id, label: def.label, category: def.category, description: def.description, docs: def.docs, fields: def.fields,
      enabled: r.enabled, configured: r.configured, source: r.source, values,
      lastTestedAt: row?.last_tested_at ?? null, lastTestOk: row?.last_test_ok == null ? null : !!row.last_test_ok, lastTestMessage: row?.last_test_message ?? null,
    };
  });
}

export function findWorkspaceByClaySecret(secret: string): string[] {
  const rows = getDb().prepare("SELECT workspace_id FROM integrations WHERE provider = 'clay'").all() as { workspace_id: string }[];
  return rows.map((r) => r.workspace_id).filter((ws) => resolveProvider(ws, "clay").config.callbackSecret === secret);
}
