import { getDb, now, parseJson } from "./db";
import { newId, randomString, sha256 } from "./ids";
import { SCOPES, type Scope } from "./types";

export interface ApiKeyRecord {
  id: string; workspaceId: string; name: string; prefix: string; scopes: Scope[];
  lastUsedAt: string | null; revokedAt: string | null; expiresAt: string | null; createdAt: string;
}
export interface ApiKeyAuth { keyId: string; workspaceId: string; scopes: Scope[] }

type Row = { id: string; workspace_id: string; name: string; prefix: string; scopes: string; last_used_at: string | null; revoked_at: string | null; expires_at: string | null; created_at: string };
const map = (r: Row): ApiKeyRecord => ({ id: r.id, workspaceId: r.workspace_id, name: r.name, prefix: r.prefix, scopes: parseJson(r.scopes, []), lastUsedAt: r.last_used_at, revokedAt: r.revoked_at, expiresAt: r.expires_at, createdAt: r.created_at });

export function sanitizeScopes(scopes: unknown): Scope[] {
  const arr = Array.isArray(scopes) ? scopes : [];
  const valid = arr.filter((s): s is Scope => (SCOPES as readonly string[]).includes(String(s)));
  return Array.from(new Set(valid));
}

/** Creates a key; the plaintext is returned exactly once. Pass `secret` only for deterministic demo seeds. */
export function createApiKey(workspaceId: string, name: string, scopes: Scope[], createdBy?: string, expiresAt?: string | null, secret?: string) {
  const clean = sanitizeScopes(scopes);
  if (!clean.length) throw new Error("Select at least one scope.");
  const resolved = secret && secret.startsWith("ff_live_") && secret.length >= 20 ? secret : `ff_live_${randomString(32)}`;
  const secretFinal = resolved;
  const id = newId("key");
  const prefix = secretFinal.slice(0, 14);
  getDb()
    .prepare("INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, scopes, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, workspaceId, name.trim() || "Untitled key", prefix, sha256(secretFinal), JSON.stringify(clean), createdBy ?? null, expiresAt ?? null, now());
  return { key: secretFinal, record: getApiKey(workspaceId, id)! };
}

export function getApiKey(workspaceId: string, id: string): ApiKeyRecord | null {
  const r = getDb().prepare("SELECT * FROM api_keys WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as Row | undefined;
  return r ? map(r) : null;
}

export function listApiKeys(workspaceId: string): ApiKeyRecord[] {
  return (getDb().prepare("SELECT * FROM api_keys WHERE workspace_id = ? ORDER BY revoked_at IS NOT NULL, created_at DESC").all(workspaceId) as Row[]).map(map);
}

export function revokeApiKey(workspaceId: string, id: string): boolean {
  return getDb().prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND workspace_id = ? AND revoked_at IS NULL").run(now(), id, workspaceId).changes > 0;
}

export function rotateApiKey(workspaceId: string, id: string, createdBy?: string) {
  const old = getApiKey(workspaceId, id);
  if (!old || old.revokedAt) throw new Error("Key not found or already revoked.");
  revokeApiKey(workspaceId, id);
  return createApiKey(workspaceId, old.name, old.scopes, createdBy, old.expiresAt);
}

export function extractKey(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return headers.get("x-api-key")?.trim() || null;
}

/** Verify a raw key; updates last_used_at. Returns null when invalid / revoked / expired. */
export function verifyApiKey(raw: string | null | undefined): ApiKeyAuth | null {
  if (!raw || !raw.startsWith("ff_")) return null;
  const db = getDb();
  const r = db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").get(sha256(raw)) as Row | undefined;
  if (!r || r.revoked_at) return null;
  if (r.expires_at && r.expires_at < now()) return null;
  db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(now(), r.id);
  return { keyId: r.id, workspaceId: r.workspace_id, scopes: parseJson(r.scopes, []) };
}

export const hasScope = (auth: ApiKeyAuth, scope: Scope) => auth.scopes.includes(scope);
