import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionByToken, type SessionInfo } from "./auth";
import { isEphemeralMode } from "./storage/mode";
import { importDemoSnapshot, ensureDemoSeed } from "./storage/demo-seed";
import { decodeDemoSnap } from "./demo-snap-codec";
import { SESSION_COOKIE, DEMO_SNAP_COOKIE } from "./cookie-names";

export { SESSION_COOKIE, DEMO_SNAP_COOKIE };

export async function applyDemoSnapCookie() {
  if (!isEphemeralMode()) return;
  ensureDemoSeed();
  const jar = await cookies();
  const raw = jar.get(DEMO_SNAP_COOKIE)?.value;
  if (!raw) return;
  const json = decodeDemoSnap(raw);
  if (json?.tables) importDemoSnapshot(json);
}

export async function getSession(): Promise<SessionInfo | null> {
  const jar = await cookies();
  return getSessionByToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionInfo> {
  if (isEphemeralMode()) await applyDemoSnapCookie();
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  const https = (process.env.PUBLIC_URL ?? "").startsWith("https") || process.env.VERCEL === "1";
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && https,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(DEMO_SNAP_COOKIE);
}
