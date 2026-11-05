import crypto from "node:crypto";
import { safeEqual } from "./secrets";

/** Claims embedded in the signed session cookie (stateless across serverless instances). */
export interface SessionClaims {
  v: 2;
  uid: string;
  wid: string;
  email: string;
  name: string;
  wsName: string;
  exp: number;
  sid: string;
}

function sessionKey(): Buffer {
  const raw = process.env.FORMFORGE_SECRET;
  if (!raw) {
    // Fall back to a process-local key (dev only). Production must set FORMFORGE_SECRET.
    const g = globalThis as unknown as { __ffSessionDevKey?: Buffer };
    if (!g.__ffSessionDevKey) g.__ffSessionDevKey = crypto.randomBytes(32);
    return g.__ffSessionDevKey;
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function signSessionClaims(input: Omit<SessionClaims, "v">): string {
  const claims: SessionClaims = { v: 2, ...input };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", sessionKey()).update(payload).digest("base64url");
  return `v2.${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionClaims | null {
  if (!token || !token.startsWith("v2.")) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [, payload, sig] = parts;
  const expect = crypto.createHmac("sha256", sessionKey()).update(payload).digest("base64url");
  if (!safeEqual(sig, expect)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims;
    if (claims.v !== 2 || !claims.uid || !claims.wid || !claims.email) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export function isSignedSessionToken(token: string | undefined | null): boolean {
  return !!token && token.startsWith("v2.");
}
