import { getDb, now, parseJson } from "../db";
import { newId } from "../ids";
import { encrypt, decrypt, maskSecret } from "../secrets";
import type { CalendarProvider, OAuthAppConfig, OAuthTokens } from "./types";

export interface OAuthConnection {
  id: string;
  workspaceId: string;
  userId: string;
  provider: CalendarProvider;
  accountEmail: string;
  scopes: string[];
  tokens: OAuthTokens;
  expiresAt: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string; workspace_id: string; user_id: string; provider: string; account_email: string;
  scopes: string; token_enc: string; refresh_enc: string | null; expires_at: string | null;
  meta: string; created_at: string; updated_at: string;
};

function map(r: Row): OAuthConnection {
  const access = decrypt(r.token_enc);
  const refresh = r.refresh_enc ? decrypt(r.refresh_enc) : undefined;
  return {
    id: r.id, workspaceId: r.workspace_id, userId: r.user_id, provider: r.provider as CalendarProvider,
    accountEmail: r.account_email, scopes: parseJson(r.scopes, []),
    tokens: { accessToken: access, refreshToken: refresh, expiresAt: r.expires_at ?? undefined },
    expiresAt: r.expires_at, meta: parseJson(r.meta, {}), createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function listConnections(ws: string, userId?: string): Omit<OAuthConnection, "tokens">[] {
  const rows = userId
    ? (getDb().prepare("SELECT * FROM oauth_connections WHERE workspace_id = ? AND user_id = ?").all(ws, userId) as Row[])
    : (getDb().prepare("SELECT * FROM oauth_connections WHERE workspace_id = ?").all(ws) as Row[]);
  return rows.map((r) => {
    const c = map(r);
    const { tokens: _t, ...rest } = c;
    void _t;
    return rest;
  });
}

export function getConnection(ws: string, userId: string, provider: CalendarProvider): OAuthConnection | null {
  const r = getDb().prepare("SELECT * FROM oauth_connections WHERE workspace_id = ? AND user_id = ? AND provider = ?").get(ws, userId, provider) as Row | undefined;
  return r ? map(r) : null;
}

export function getConnectionByEmail(ws: string, email: string, provider?: CalendarProvider): OAuthConnection | null {
  const rows = provider
    ? (getDb().prepare("SELECT * FROM oauth_connections WHERE workspace_id = ? AND lower(account_email) = lower(?) AND provider = ?").all(ws, email, provider) as Row[])
    : (getDb().prepare("SELECT * FROM oauth_connections WHERE workspace_id = ? AND lower(account_email) = lower(?)").all(ws, email) as Row[]);
  return rows[0] ? map(rows[0]) : null;
}

export function upsertConnection(input: {
  workspaceId: string; userId: string; provider: CalendarProvider; accountEmail: string;
  tokens: OAuthTokens; scopes?: string[]; meta?: Record<string, unknown>;
}): OAuthConnection {
  const existing = getConnection(input.workspaceId, input.userId, input.provider);
  const id = existing?.id ?? newId("oauth");
  const ts = now();
  getDb().prepare(`INSERT INTO oauth_connections (id, workspace_id, user_id, provider, account_email, scopes, token_enc, refresh_enc, expires_at, meta, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, user_id, provider) DO UPDATE SET
      account_email = excluded.account_email, scopes = excluded.scopes, token_enc = excluded.token_enc,
      refresh_enc = excluded.refresh_enc, expires_at = excluded.expires_at, meta = excluded.meta, updated_at = excluded.updated_at`)
    .run(
      id, input.workspaceId, input.userId, input.provider, input.accountEmail,
      JSON.stringify(input.scopes ?? input.tokens.scope ?? []),
      encrypt(input.tokens.accessToken),
      input.tokens.refreshToken ? encrypt(input.tokens.refreshToken) : null,
      input.tokens.expiresAt ?? null,
      JSON.stringify(input.meta ?? {}),
      existing?.createdAt ?? ts, ts,
    );
  return getConnection(input.workspaceId, input.userId, input.provider)!;
}

export function deleteConnection(ws: string, userId: string, provider: CalendarProvider) {
  return getDb().prepare("DELETE FROM oauth_connections WHERE workspace_id = ? AND user_id = ? AND provider = ?").run(ws, userId, provider).changes > 0;
}

export function saveAppConfig(ws: string, provider: CalendarProvider, config: Omit<OAuthAppConfig, "redirectUri"> & { redirectUri?: string }) {
  getDb().prepare(`INSERT INTO oauth_app_config (workspace_id, provider, config_enc, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(workspace_id, provider) DO UPDATE SET config_enc = excluded.config_enc, updated_at = excluded.updated_at`)
    .run(ws, provider, encrypt(JSON.stringify(config)), now());
}

export function getAppConfig(ws: string, provider: CalendarProvider): (Omit<OAuthAppConfig, "redirectUri"> & { redirectUri?: string }) | null {
  const r = getDb().prepare("SELECT config_enc FROM oauth_app_config WHERE workspace_id = ? AND provider = ?").get(ws, provider) as { config_enc: string } | undefined;
  if (!r) return null;
  try { return JSON.parse(decrypt(r.config_enc)); } catch { return null; }
}

export function resolveAppConfig(ws: string, provider: CalendarProvider, publicBase: string): OAuthAppConfig | null {
  const stored = getAppConfig(ws, provider);
  if (provider === "google") {
    const clientId = stored?.clientId || process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = stored?.clientSecret || process.env.GOOGLE_CLIENT_SECRET || "";
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret, redirectUri: `${publicBase}/api/oauth/google/callback` };
  }
  const clientId = stored?.clientId || process.env.MICROSOFT_CLIENT_ID || "";
  const clientSecret = stored?.clientSecret || process.env.MICROSOFT_CLIENT_SECRET || "";
  const tenant = stored?.tenant || process.env.MICROSOFT_TENANT || "common";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, tenant, redirectUri: `${publicBase}/api/oauth/microsoft/callback` };
}

export function appConfigView(ws: string, provider: CalendarProvider) {
  const stored = getAppConfig(ws, provider);
  const envConfigured = provider === "google"
    ? !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    : !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  const clientId = stored?.clientId || (provider === "google" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID) || "";
  return {
    provider,
    configured: !!(clientId && (stored?.clientSecret || envConfigured)),
    source: stored?.clientId ? "workspace" as const : envConfigured ? "env" as const : null,
    clientId: maskSecret(clientId),
    tenant: provider === "microsoft" ? (stored?.tenant || process.env.MICROSOFT_TENANT || "common") : undefined,
  };
}

export function connectionsView(ws: string, userId: string) {
  return listConnections(ws, userId).map((c) => ({
    provider: c.provider,
    accountEmail: c.accountEmail,
    connected: true,
    expiresAt: c.expiresAt,
    updatedAt: c.updatedAt,
  }));
}
