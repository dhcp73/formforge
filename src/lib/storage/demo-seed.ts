import { getDb } from "../db";
import { isEphemeralMode } from "./mode";
import { createUser } from "../auth";
import { createForm } from "../forms";
import { createApiKey } from "../apikeys";
import { SCOPES } from "../types";

const g = globalThis as unknown as { __ffDemoSeeded?: boolean };

/** Idempotent demo seed for ephemeral (browser/memory) mode. */
export function ensureDemoSeed() {
  if (!isEphemeralMode() || g.__ffDemoSeeded) return;
  const db = getDb();
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get("demo@formforge.dev")) {
    g.__ffDemoSeeded = true;
    return;
  }
  process.env.FORMFORGE_DNS ??= "off";
  const { workspaceId: ws } = createUser({
    email: "demo@formforge.dev", name: "Demo User", password: "demo1234", workspaceName: "Acme Growth",
  });
  createForm(ws, { name: "Contact sales", description: "Demo-request form" });
  createForm(ws, { name: "Newsletter signup", description: "Footer signup" });
  createApiKey(ws, "Demo key", [...SCOPES]);
  g.__ffDemoSeeded = true;
}

/** Export a portable snapshot of the demo workspace (for localStorage). */
export function exportDemoSnapshot(): Record<string, unknown> {
  const db = getDb();
  const tables = [
    "users", "workspaces", "memberships", "forms", "submissions", "api_keys",
    "webhooks", "routing_rules", "integrations", "schedules", "oauth_connections", "oauth_app_config", "kv",
  ];
  const out: Record<string, unknown> = { v: 1, exportedAt: new Date().toISOString(), tables: {} as Record<string, unknown[]> };
  for (const t of tables) {
    try { (out.tables as Record<string, unknown[]>)[t] = db.prepare(`SELECT * FROM ${t}`).all() as unknown[]; }
    catch { (out.tables as Record<string, unknown[]>)[t] = []; }
  }
  return out;
}

/** Restore a snapshot into the current (ephemeral) DB. Destructive for listed tables. */
export function importDemoSnapshot(snap: { tables?: Record<string, Array<Record<string, unknown>>> }) {
  if (!isEphemeralMode()) throw new Error("Restore is only allowed in browser/memory mode");
  const db = getDb();
  const tables = snap.tables ?? {};
  const order = [
    "workspaces", "users", "memberships", "forms", "submissions", "api_keys",
    "webhooks", "routing_rules", "integrations", "schedules", "oauth_app_config", "oauth_connections", "kv",
  ];
  db.transaction(() => {
    for (const t of [...order].reverse()) {
      try { db.exec(`DELETE FROM ${t}`); } catch { /* ignore */ }
    }
    for (const t of order) {
      const rows = tables[t] ?? [];
      for (const row of rows) {
        const keys = Object.keys(row);
        if (!keys.length) continue;
        const placeholders = keys.map(() => "?").join(",");
        try {
          db.prepare(`INSERT OR REPLACE INTO ${t} (${keys.join(",")}) VALUES (${placeholders})`).run(...keys.map((k) => row[k]));
        } catch (e) {
          console.error("[demo] restore row", t, e);
        }
      }
    }
  })();
  g.__ffDemoSeeded = true;
}
