import crypto from "node:crypto";
import { getDb, now } from "./db";
import { newId, randomString, sha256 } from "./ids";
import { isEphemeralMode } from "./storage/mode";
import { signSessionClaims, verifySessionToken, isSignedSessionToken, type SessionClaims } from "./auth-token";

export interface User { id: string; email: string; name: string; createdAt: string }
export interface Workspace { id: string; name: string; plan: string; role: string }
export interface SessionInfo { user: User; workspace: Workspace; workspaces: Workspace[]; sessionId: string }

const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(hashHex, "hex");
  return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
}

export class AuthError extends Error {}

export function createUser(input: {
  email: string; name: string; password: string; workspaceName?: string;
  userId?: string; workspaceId?: string;
}) {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError("Enter a valid email address.");
  if (input.password.length < 8) throw new AuthError("Password must be at least 8 characters.");
  if (!input.name.trim()) throw new AuthError("Name is required.");
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) throw new AuthError("An account with this email already exists.");
  const userId = input.userId && /^[A-Za-z0-9_-]{6,40}$/.test(input.userId) ? input.userId : newId("usr");
  const wsId = input.workspaceId && /^[A-Za-z0-9_-]{6,40}$/.test(input.workspaceId) ? input.workspaceId : newId("ws");
  const ts = now();
  db.transaction(() => {
    db.prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(userId, email, input.name.trim(), hashPassword(input.password), ts);
    db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(wsId, input.workspaceName?.trim() || `${input.name.trim().split(" ")[0]}'s workspace`, ts);
    db.prepare("INSERT INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(userId, wsId, ts);
  })();
  return { userId, workspaceId: wsId };
}

export function authenticate(email: string, password: string): { userId: string } {
  const row = getDb().prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email.trim().toLowerCase()) as { id: string; password_hash: string } | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) throw new AuthError("Invalid email or password.");
  return { userId: row.id };
}

export function listWorkspaces(userId: string): Workspace[] {
  return getDb()
    .prepare("SELECT w.id, w.name, w.plan, m.role FROM workspaces w JOIN memberships m ON m.workspace_id = w.id WHERE m.user_id = ? ORDER BY w.created_at")
    .all(userId) as Workspace[];
}

/** Ensure the principal from a signed cookie exists in this instance's DB (upsert). */
export function ensurePrincipalFromClaims(claims: SessionClaims): SessionInfo {
  const db = getDb();
  const ts = now();
  const email = claims.email.trim().toLowerCase();
  db.transaction(() => {
    const existing = db.prepare("SELECT id, email, name, created_at AS createdAt FROM users WHERE id = ?").get(claims.uid) as User | undefined;
    if (!existing) {
      // Placeholder hash — password login on a cold instance for non-demo users requires restore/seed.
      const ph = hashPassword(randomString(24));
      db.prepare("INSERT OR IGNORE INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
        claims.uid, email, claims.name || email, ph, ts,
      );
    } else if (existing.name !== claims.name && claims.name) {
      db.prepare("UPDATE users SET name = ? WHERE id = ?").run(claims.name, claims.uid);
    }
    // Also map by email if id collided differently (demo seed race)
    const byEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string } | undefined;
    if (byEmail && byEmail.id !== claims.uid) {
      // Prefer claim uid; leave orphan — rare.
    }
    db.prepare("INSERT OR IGNORE INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(
      claims.wid, claims.wsName || "Workspace", ts,
    );
    if (claims.wsName) db.prepare("UPDATE workspaces SET name = ? WHERE id = ?").run(claims.wsName, claims.wid);
    db.prepare("INSERT OR IGNORE INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(
      claims.uid, claims.wid, ts,
    );
  })();
  const u = db.prepare("SELECT id, email, name, created_at AS createdAt FROM users WHERE id = ?").get(claims.uid) as User;
  const workspaces = listWorkspaces(u.id);
  let workspace = workspaces.find((w) => w.id === claims.wid);
  if (!workspace) {
    workspace = { id: claims.wid, name: claims.wsName || "Workspace", plan: "free", role: "owner" };
  }
  return { user: u, workspace, workspaces: workspaces.length ? workspaces : [workspace], sessionId: claims.sid };
}

function loadUserRow(userId: string): User | null {
  return (getDb().prepare("SELECT id, email, name, created_at AS createdAt FROM users WHERE id = ?").get(userId) as User | undefined) ?? null;
}

/** Returns a signed session token (httpOnly cookie). Works across ephemeral serverless instances. */
export function createSession(userId: string, workspaceId?: string): string {
  const u = loadUserRow(userId);
  if (!u) throw new AuthError("User not found");
  const workspaces = listWorkspaces(userId);
  const ws = workspaceId ? workspaces.find((w) => w.id === workspaceId) : workspaces[0];
  if (!ws) throw new AuthError("User has no workspace");
  const sid = randomString(24);
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const token = signSessionClaims({
    uid: u.id, wid: ws.id, email: u.email, name: u.name, wsName: ws.name, exp, sid,
  });
  // Best-effort DB row for sqlite mode / logout bookkeeping (ignored on other instances).
  if (!isEphemeralMode()) {
    try {
      const expires = new Date(exp * 1000).toISOString();
      getDb().prepare("INSERT INTO sessions (id, user_id, workspace_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(sha256(sid), userId, ws.id, expires, now());
    } catch { /* ignore */ }
  }
  return token;
}

export function getSessionByToken(token: string | undefined | null): SessionInfo | null {
  if (!token) return null;
  const claims = verifySessionToken(token);
  if (claims) return ensurePrincipalFromClaims(claims);

  // Legacy DB-backed tokens (pre-v2) — sqlite only.
  if (isSignedSessionToken(token)) return null;
  const db = getDb();
  const s = db.prepare("SELECT id, user_id, workspace_id, expires_at FROM sessions WHERE id = ?").get(sha256(token)) as
    | { id: string; user_id: string; workspace_id: string; expires_at: string }
    | undefined;
  if (!s || s.expires_at < now()) return null;
  const u = loadUserRow(s.user_id);
  if (!u) return null;
  const workspaces = listWorkspaces(u.id);
  const workspace = workspaces.find((w) => w.id === s.workspace_id) ?? workspaces[0];
  if (!workspace) return null;
  return { user: u, workspace, workspaces, sessionId: s.id };
}

export function deleteSession(token: string) {
  const claims = verifySessionToken(token);
  if (claims) {
    try { getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sha256(claims.sid)); } catch { /* ignore */ }
    return;
  }
  try { getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sha256(token)); } catch { /* ignore */ }
}

/** Switch workspace and return a fresh signed cookie value. */
export function switchWorkspace(userId: string, workspaceId: string): string {
  const ok = getDb().prepare("SELECT 1 FROM memberships WHERE user_id = ? AND workspace_id = ?").get(userId, workspaceId);
  if (!ok) throw new AuthError("Not a member of that workspace");
  return createSession(userId, workspaceId);
}

export function createWorkspace(userId: string, name: string): string {
  const id = newId("ws");
  const ts = now();
  const db = getDb();
  db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(id, name.trim() || "New workspace", ts);
  db.prepare("INSERT INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(userId, id, ts);
  return id;
}

export function renameWorkspace(workspaceId: string, name: string) {
  getDb().prepare("UPDATE workspaces SET name = ? WHERE id = ?").run(name.trim(), workspaceId);
}

export function updateProfile(userId: string, name: string) {
  getDb().prepare("UPDATE users SET name = ? WHERE id = ?").run(name.trim(), userId);
}

export function changePassword(userId: string, current: string, next: string) {
  const row = getDb().prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as { password_hash: string };
  if (!verifyPassword(current, row.password_hash)) throw new AuthError("Current password is incorrect.");
  if (next.length < 8) throw new AuthError("New password must be at least 8 characters.");
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next), userId);
}
