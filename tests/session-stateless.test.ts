import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDb, getDb } from "@/lib/db";
import { createUser, createSession, getSessionByToken, switchWorkspace, ensurePrincipalFromClaims, createWorkspace } from "@/lib/auth";
import { verifySessionToken } from "@/lib/auth-token";
import { createForm } from "@/lib/forms";

describe("stateless signed sessions (cross-instance)", () => {
  beforeEach(() => {
    process.env.STORAGE_MODE = "sqlite";
    process.env.FORMFORGE_DNS = "off";
    resetDb();
  });
  afterEach(() => {
    resetDb();
  });

  it("createSession issues a v2 HMAC token verified without DB session row", () => {
    const { userId } = createUser({ email: "a@example.com", name: "Ada", password: "password1", workspaceName: "Ada Co" });
    const token = createSession(userId);
    expect(token.startsWith("v2.")).toBe(true);
    const claims = verifySessionToken(token);
    expect(claims?.email).toBe("a@example.com");
    expect(claims?.uid).toBe(userId);
    const s = getSessionByToken(token);
    expect(s?.user.email).toBe("a@example.com");
    expect(s?.workspace.name).toBe("Ada Co");
  });

  it("survives a full DB wipe via claims upsert", () => {
    const { userId, workspaceId } = createUser({
      email: "b@example.com", name: "Bea", password: "password1", workspaceName: "Bea Co",
      userId: "usr_bea_fixed01", workspaceId: "ws_bea_fixed01",
    });
    createForm(workspaceId, { id: "formBea001", name: "Bea Form" });
    const token = createSession(userId);

    resetDb();
    expect((getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c).toBe(0);

    const s = getSessionByToken(token);
    expect(s).not.toBeNull();
    expect(s!.user.id).toBe("usr_bea_fixed01");
    expect(s!.workspace.id).toBe("ws_bea_fixed01");
    expect(s!.user.email).toBe("b@example.com");
  });

  it("switchWorkspace returns a new signed token for the target workspace", () => {
    const { userId } = createUser({ email: "c@example.com", name: "Cara", password: "password1", workspaceName: "One" });
    const ws2 = createWorkspace(userId, "Two");
    const t2 = switchWorkspace(userId, ws2);
    const s = getSessionByToken(t2)!;
    expect(s.workspace.id).toBe(ws2);
    expect(s.workspace.name).toBe("Two");
  });

  it("signed token still authenticates after resetDb (simulates other instance)", () => {
    const { userId } = createUser({
      email: "demo2@example.com", name: "Demo2", password: "password1", workspaceName: "D2",
      userId: "usr_demo2fixed01", workspaceId: "ws_demo2fixed01",
    });
    const token = createSession(userId);
    resetDb();
    const s = getSessionByToken(token)!;
    expect(s.user.id).toBe("usr_demo2fixed01");
    expect(s.workspace.id).toBe("ws_demo2fixed01");
  });

  it("ensurePrincipalFromClaims is idempotent", () => {
    resetDb();
    const claims = {
      v: 2 as const, uid: "usr_x1", wid: "ws_x1", email: "x@y.com", name: "X", wsName: "XWS",
      exp: Math.floor(Date.now() / 1000) + 3600, sid: "sid1",
    };
    const a = ensurePrincipalFromClaims(claims);
    const b = ensurePrincipalFromClaims(claims);
    expect(a.user.id).toBe(b.user.id);
    expect((getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c).toBe(1);
  });
});
