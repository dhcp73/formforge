import "server-only";
import { cookies } from "next/headers";
import { isEphemeralMode } from "./storage/mode";
import { exportDemoSnapshot } from "./storage/demo-seed";
import { DEMO_SNAP_COOKIE } from "./cookie-names";
import { encodeDemoSnap } from "./demo-snap-codec";

export { encodeDemoSnap, decodeDemoSnap } from "./demo-snap-codec";

/** Persist a compact snapshot cookie so SSR on another instance can rehydrate. */
export async function persistDemoSnapCookie(snap?: Record<string, unknown>) {
  if (!isEphemeralMode()) return false;
  const data = snap ?? exportDemoSnapshot();
  const encoded = encodeDemoSnap(data as Record<string, unknown>);
  if (!encoded) return false;
  const jar = await cookies();
  const https = (process.env.PUBLIC_URL ?? "").startsWith("https") || process.env.VERCEL === "1";
  jar.set(DEMO_SNAP_COOKIE, encoded, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && https,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}
