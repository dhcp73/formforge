import { getDb, now } from "../db";
import { isEphemeralMode } from "./mode";
import { createUser } from "../auth";
import { createForm } from "../forms";
import { createApiKey } from "../apikeys";
import { createRule } from "../routing";
import { SCOPES } from "../types";

const g = globalThis as unknown as { __ffDemoSeeded?: boolean };

/** Fixed browser/demo API key so Vercel instances and e2e can authenticate without a one-time plaintext. */
export const DEMO_API_KEY = "ff_live_FormForgeDemoBrowserKey000000001";

/** Idempotent demo seed for ephemeral (browser/memory) mode. */
export function ensureDemoSeed() {
  if (!isEphemeralMode() || g.__ffDemoSeeded) return;
  const db = getDb();
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get("demo@formforge.dev")) {
    g.__ffDemoSeeded = true;
    return;
  }
  process.env.FORMFORGE_DNS ??= "off";
  const { workspaceId: ws, userId } = createUser({
    email: "demo@formforge.dev", name: "Demo User", password: "demo1234", workspaceName: "Acme Growth",
    userId: "usr_ffDemoUser01", workspaceId: "ws_ffDemoWs01",
  });
  const sales = createForm(ws, {
    id: "ffDemoSale",
    name: "Contact sales",
    description: "Demo-request form",
    settings: {
      notifyEmails: ["sales@acme.io"],
      autoresponder: {
        enabled: true,
        subject: "Thanks {{name}} — we'll be in touch",
        body: "Hi {{name}},\n\nThanks for reaching out to Acme. A specialist will reply within one business day.\n\n— The Acme team",
      },
    } as never,
  });
  createForm(ws, { id: "ffDemoNews", name: "Newsletter signup", description: "Footer signup" });
  createForm(ws, {
    id: "ffDemoBeta",
    name: "Beta waitlist",
    description: "Private beta for the new analytics product",
    settings: {
      schemaMode: "validate",
      maxSubmissions: 500,
      fields: [
        { name: "email", label: "Work email", type: "email", required: true },
        { name: "name", label: "Full name", type: "text", required: true },
        { name: "company", label: "Company", type: "text", required: false },
        { name: "role", label: "Your role", type: "select", required: false, options: ["Engineering", "Product", "Growth", "Other"] },
        { name: "role_other", label: "Which role?", type: "text", required: true, showIf: { field: "role", op: "eq", value: "Other" } },
        { name: "team_size", label: "Team size", type: "number", required: false, showIf: { field: "role", op: "in", value: ["Engineering", "Product"] } },
        { name: "use_case", label: "What would you use it for?", type: "longtext", required: false },
      ],
    } as never,
  });

  createRule(ws, {
    name: "Enterprise (200+ employees) → AE team",
    priority: 10,
    match: "all",
    conditions: [{ field: "company.employees", op: "gte", value: 200 }],
    actions: {
      assignTo: ["ava@acme.io", "sam@acme.io"],
      weights: { "ava@acme.io": 2, "sam@acme.io": 1 },
      sticky: true,
      tags: ["enterprise"],
      bookingUrl: "https://cal.com/{{owner_name}}/intro?email={{email}}",
      ownerBookingUrls: { "ava@acme.io": "https://cal.com/ava-acme/enterprise-demo" },
    },
    stopOnMatch: true,
  });
  createRule(ws, {
    name: "Strategic accounts (named domains) → Ava",
    priority: 8,
    match: "any",
    conditions: [
      { field: "company.domain", op: "in", value: ["stripe.com", "openai.com", "shopify.com"] },
      { field: "email.domain", op: "ends_with", value: ".gov" },
    ],
    actions: {
      assignTo: ["ava@acme.io"],
      sticky: true,
      tags: ["strategic"],
      bookingUrl: "https://cal.com/ava-acme/enterprise-demo",
    },
    stopOnMatch: true,
  });
  createRule(ws, {
    name: "Startups → self-serve",
    priority: 30,
    match: "any",
    conditions: [
      { field: "company.employees", op: "lt", value: 50 },
      { field: "email.freeProvider", op: "eq", value: true },
    ],
    actions: { assignTo: ["growth@acme.io"], tags: ["self-serve"] },
    stopOnMatch: true,
  });

  createApiKey(ws, "Demo key", [...SCOPES], userId, null, DEMO_API_KEY);

  // One sample submission so dashboard / e2e ids resolve without a prior POST.
  const subId = "sub_ffDemoSample01";
  const t = now();
  db.prepare(
    `INSERT INTO submissions (id, form_id, workspace_id, data, field_types, files, meta, enrichment, spam_score, is_spam, spam_reasons, status, content_hash, search_text, activity, enrichment_status, created_at)
     VALUES (?, ?, ?, ?, '{}', '[]', '{}', '{}', 0, 0, '[]', 'new', ?, ?, '[]', 'done', ?)`,
  ).run(
    subId,
    sales.id,
    ws,
    JSON.stringify({ name: "Demo Lead", email: "demo.lead@stripe.com", message: "Seeded sample" }),
    `seed-${subId}`,
    "Demo Lead demo.lead@stripe.com Seeded sample",
    t,
  );

  g.__ffDemoSeeded = true;
}

/** Export a portable snapshot of the demo workspace (for localStorage). */
export function exportDemoSnapshot(): Record<string, unknown> {
  const db = getDb();
  const tables = [
    "users", "workspaces", "memberships", "forms", "submissions", "api_keys",
    "webhooks", "routing_rules", "integrations", "schedules", "oauth_connections", "oauth_app_config", "kv",
  ];
  const out: Record<string, unknown> = {
    v: 1,
    exportedAt: new Date().toISOString(),
    demoApiKey: isEphemeralMode() ? DEMO_API_KEY : undefined,
    tables: {} as Record<string, unknown[]>,
  };
  for (const t of tables) {
    try { (out.tables as Record<string, unknown[]>)[t] = db.prepare(`SELECT * FROM ${t}`).all() as unknown[]; }
    catch { (out.tables as Record<string, unknown[]>)[t] = []; }
  }
  return out;
}

/**
 * Merge a snapshot into the current (ephemeral) DB.
 * Upserts rows without wiping — so a stale localStorage snap cannot delete forms
 * just created on this instance (critical on Vercel multi-instance demos).
 */
export function importDemoSnapshot(snap: { tables?: Record<string, Array<Record<string, unknown>>> }) {
  if (!isEphemeralMode()) throw new Error("Restore is only allowed in browser/memory mode");
  const db = getDb();
  const tables = snap.tables ?? {};
  const order = [
    "workspaces", "users", "memberships", "forms", "submissions", "api_keys",
    "webhooks", "routing_rules", "integrations", "schedules", "oauth_app_config", "oauth_connections", "kv",
  ];
  db.transaction(() => {
    for (const t of order) {
      const rows = tables[t] ?? [];
      for (const row of rows) {
        const keys = Object.keys(row);
        if (!keys.length) continue;
        // Prefer the newer updated_at/created_at when both exist
        if (row.id != null) {
          try {
            const cur = db.prepare(`SELECT updated_at, created_at FROM ${t} WHERE id = ?`).get(row.id) as
              | { updated_at?: string; created_at?: string }
              | undefined;
            if (cur) {
              const curTs = String(cur.updated_at || cur.created_at || "");
              const incTs = String(row.updated_at ?? row.created_at ?? "");
              if (curTs && incTs && curTs > incTs) continue;
            }
          } catch { /* table may lack those columns */ }
        }
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
