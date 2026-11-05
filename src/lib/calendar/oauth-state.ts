import crypto from "node:crypto";
import { encrypt, decrypt } from "../secrets";

/** Short-lived signed OAuth state: ws + user + provider + nonce. */
export function makeOAuthState(payload: { workspaceId: string; userId: string; provider: string; returnTo?: string }) {
  const body = JSON.stringify({ ...payload, n: crypto.randomBytes(8).toString("hex"), exp: Date.now() + 15 * 60_000 });
  return encrypt(body);
}

export function parseOAuthState(state: string): { workspaceId: string; userId: string; provider: string; returnTo?: string } {
  const j = JSON.parse(decrypt(state)) as { workspaceId: string; userId: string; provider: string; returnTo?: string; exp: number };
  if (!j.exp || j.exp < Date.now()) throw new Error("OAuth state expired");
  return j;
}
