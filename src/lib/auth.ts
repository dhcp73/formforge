import crypto from "node:crypto";
import { getDb, now } from "./db";
import { newId, randomString, sha256 } from "./ids";

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

export function createUser(input: { email: string; name: string; password: string; workspaceName?: string }) {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError("Enter a valid email address.");
  if (input.password.length < 8) throw new AuthError("Password must be at least 8 characters.");
  if (!input.name.trim()) throw new AuthError("Name is required.");
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) throw new AuthError("An account with this email already exists.");
  const userId = newId("usr");
  const wsId = newId("ws");
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

/** Returns the raw session token (store in cookie); DB stores only its hash. */
export function createSession(userId: string, workspaceId?: string): string {
  const ws = workspaceId ?? listWorkspaces(userId)[0]?.id;
  if (!ws) throw new AuthError("User has no workspace");
  const token = randomString(40);
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  getDb().prepare("INSERT INTO sessions (id, user_id, workspace_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(sha256(token), userId, ws, expires, now());
  return token;
}

export function getSessionByToken(token: string | undefined | null): SessionInfo | null {
  if (!token) return null;
  const db = getDb();
  const s = db.prepare("SELECT id, user_id, workspace_id, expires_at FROM sessions WHERE id = ?").get(sha256(token)) as
    | { id: string; user_id: string; workspace_id: string; expires_at: string }
    | undefined;
  if (!s || s.expires_at < now()) return null;
  const u = db.prepare("SELECT id, email, name, created_at AS createdAt FROM users WHERE id = ?").get(s.user_id) as User | undefined;
  if (!u) return null;
  const workspaces = listWorkspaces(u.id);
  const workspace = workspaces.find((w) => w.id === s.workspace_id) ?? workspaces[0];
  if (!workspace) return null;
  return { user: u, workspace, workspaces, sessionId: s.id };
}

export function deleteSession(token: string) {
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sha256(token));
}

export function switchWorkspace(sessionId: string, userId: string, workspaceId: string) {
  const ok = getDb().prepare("SELECT 1 FROM memberships WHERE user_id = ? AND workspace_id = ?").get(userId, workspaceId);
  if (!ok) throw new AuthError("Not a member of that workspace");
  getDb().prepare("UPDATE sessions SET workspace_id = ? WHERE id = ?").run(workspaceId, sessionId);
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
