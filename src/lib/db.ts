import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { isEphemeralMode, storageMode } from "./storage/mode";
export { isEphemeralMode, storageMode, isBrowserMode } from "./storage/mode";
import type { DbLike } from "./storage/node-sqlite";

type DB = DbLike;

const g = globalThis as unknown as { __ffdb?: DB; __ffdbPath?: string; __ffSeeded?: boolean };

export function dataDir(): string {
  if (isEphemeralMode()) {
    const dir = process.env.FORMFORGE_DATA_DIR || path.join(process.cwd(), "data", "ephemeral");
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* read-only fs on some hosts */ }
    return dir;
  }
  const dir = process.env.FORMFORGE_DATA_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function dbPath(): string {
  if (isEphemeralMode()) return ":memory:";
  return process.env.FORMFORGE_DB || path.join(dataDir(), "formforge.db");
}

async function openSqliteFile(p: string): Promise<DB> {
  // Dynamic import so better-sqlite3 is never loaded in browser/memory mode (Vercel-safe).
  const Database = (await import("better-sqlite3")).default;
  const db = new Database(p) as unknown as DB & { pragma: (s: string) => unknown; transaction: <T>(fn: () => T) => () => T; close: () => void };
  return db;
}

function openNow(p: string): DB {
  if (isEphemeralMode()) {
    // Synchronous path using node:sqlite — no native addon.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openNodeSqlite } = require("./storage/node-sqlite") as typeof import("./storage/node-sqlite");
    return openNodeSqlite(p);
  }
  // Sync require for the default path (Next.js serverExternalPackages handles the native binding).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const db = new Database(p);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db as DB;
}

export function getDb(): DB {
  const p = dbPath();
  if (g.__ffdb && g.__ffdbPath === p) return g.__ffdb;
  if (p !== ":memory:") {
    try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch { /* ignore */ }
  }
  const db = openNow(p);
  if (!isEphemeralMode()) {
    try {
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      db.pragma("busy_timeout = 5000");
    } catch { /* already set */ }
  } else {
    try { db.exec("PRAGMA foreign_keys = ON"); } catch { /* ignore */ }
  }
  migrate(db);
  g.__ffdb = db;
  g.__ffdbPath = p;
  if (isEphemeralMode()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ensureDemoSeed } = require("./storage/demo-seed") as typeof import("./storage/demo-seed");
      ensureDemoSeed();
    } catch (e) {
      console.error("[db] demo seed", e);
    }
  }
  return db;
}


/** Close and forget the cached connection (used by tests). */
export function resetDb() {
  if (g.__ffdb) {
    try { g.__ffdb.close(); } catch { /* ignore */ }
  }
  g.__ffdb = undefined;
  g.__ffdbPath = undefined;
  g.__ffSeeded = false;
  try {
    (globalThis as unknown as { __ffDemoSeeded?: boolean }).__ffDemoSeeded = false;
  } catch { /* ignore */ }
}

export function now(): string {
  return new Date().toISOString();
}

export function parseJson<T>(v: unknown, fallback: T): T {
  if (typeof v !== "string" || !v) return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

export function demoModeLabel(): string | null {
  const m = storageMode();
  if (m === "browser") return "Demo mode: data stored in your browser (server memory is ephemeral per instance).";
  if (m === "memory") return "Demo mode: in-memory database (resets when the server restarts).";
  return null;
}

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS memberships (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, workspace_id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS forms (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_forms_ws ON forms(workspace_id);
  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    data TEXT NOT NULL,
    field_types TEXT NOT NULL DEFAULT '{}',
    files TEXT NOT NULL DEFAULT '[]',
    meta TEXT NOT NULL DEFAULT '{}',
    enrichment TEXT NOT NULL DEFAULT '{}',
    spam_score INTEGER NOT NULL DEFAULT 0,
    is_spam INTEGER NOT NULL DEFAULT 0,
    spam_reasons TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'new',
    content_hash TEXT NOT NULL DEFAULT '',
    search_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sub_form ON submissions(form_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sub_ws ON submissions(workspace_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sub_hash ON submissions(form_id, content_hash);
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    scopes TEXT NOT NULL,
    created_by TEXT,
    last_used_at TEXT,
    revoked_at TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT '["submission.created"]',
    include_spam INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id TEXT PRIMARY KEY,
    webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    form_id TEXT NOT NULL,
    submission_id TEXT,
    event TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    response_status INTEGER,
    response_body TEXT,
    error TEXT,
    duration_ms INTEGER,
    next_attempt_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_deliv_ws ON webhook_deliveries(workspace_id, created_at);
  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    cron TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    config TEXT NOT NULL DEFAULT '{}',
    active INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    last_status TEXT,
    last_detail TEXT,
    next_run_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    run_at TEXT NOT NULL,
    locked_at TEXT,
    last_error TEXT,
    result TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_due ON jobs(status, run_at);
  CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    to_addr TEXT NOT NULL,
    subject TEXT NOT NULL,
    text_body TEXT NOT NULL,
    html_body TEXT,
    kind TEXT NOT NULL DEFAULT 'notification',
    status TEXT NOT NULL DEFAULT 'logged',
    transport TEXT NOT NULL DEFAULT 'outbox',
    error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exports (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    form_id TEXT NOT NULL,
    schedule_id TEXT,
    filename TEXT NOT NULL,
    format TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE workspaces ADD COLUMN system INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE submissions ADD COLUMN owner TEXT;
  ALTER TABLE submissions ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE submissions ADD COLUMN routing TEXT NOT NULL DEFAULT '{}';
  ALTER TABLE submissions ADD COLUMN fit_score INTEGER;
  ALTER TABLE submissions ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'pending';
  ALTER TABLE submissions ADD COLUMN activity TEXT NOT NULL DEFAULT '[]';
  CREATE TABLE IF NOT EXISTS integrations (
    workspace_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    config_enc TEXT,
    last_tested_at TEXT,
    last_test_ok INTEGER,
    last_test_message TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (workspace_id, provider)
  );
  CREATE TABLE IF NOT EXISTS enrichment_cache (
    provider TEXT NOT NULL,
    cache_key TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY (provider, cache_key)
  );
  CREATE TABLE IF NOT EXISTS enrichment_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    submission_id TEXT,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    credits REAL NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    message TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_elog_ws ON enrichment_logs(workspace_id, created_at);
  CREATE TABLE IF NOT EXISTS research_tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    submission_id TEXT,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    query TEXT NOT NULL,
    secret_enc TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    result TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS routing_rules (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    form_id TEXT,
    name TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,
    match TEXT NOT NULL DEFAULT 'all',
    conditions TEXT NOT NULL DEFAULT '[]',
    actions TEXT NOT NULL DEFAULT '{}',
    stop_on_match INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    hit_count INTEGER NOT NULL DEFAULT 0,
    rr_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS health_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    component TEXT NOT NULL,
    status TEXT NOT NULL,
    latency_ms INTEGER,
    message TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_hc ON health_checks(component, created_at);
  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    component TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    title TEXT NOT NULL,
    last_message TEXT,
    started_at TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS qa_runs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '{}',
    report_path TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS oauth_connections (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    account_email TEXT NOT NULL DEFAULT '',
    scopes TEXT NOT NULL DEFAULT '[]',
    token_enc TEXT NOT NULL,
    refresh_enc TEXT,
    expires_at TEXT,
    meta TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (workspace_id, user_id, provider)
  );
  CREATE INDEX IF NOT EXISTS idx_oauth_ws ON oauth_connections(workspace_id, provider);
  CREATE TABLE IF NOT EXISTS oauth_app_config (
    workspace_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    config_enc TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (workspace_id, provider)
  );
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    submission_id TEXT,
    owner_email TEXT NOT NULL,
    provider TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    meet_url TEXT,
    event_id TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TEXT NOT NULL
  );
  `,
];

function migrate(db: DB) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const row = db.prepare(`SELECT MAX(version) AS v FROM _migrations`).get() as { v: number | null };
  const current = row?.v ?? 0;
  for (let i = current; i < MIGRATIONS.length; i++) {
    // ALTER TABLE … ADD COLUMN fails when the column already exists — run statements individually and ignore duplicates
    const stmts = MIGRATIONS[i].split(";").map((x) => x.trim()).filter(Boolean);
    db.transaction(() => {
      for (const sql of stmts) {
        try { db.exec(sql); } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!/duplicate column|already exists/i.test(msg)) throw e;
        }
      }
      db.prepare(`INSERT INTO _migrations (version, applied_at) VALUES (?, ?)`).run(i + 1, now());
    })();
  }
}

// Keep openSqliteFile referenced for tree-shaking clarity in docs (async path unused in sync getDb).
void openSqliteFile;
