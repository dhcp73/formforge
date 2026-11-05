import "server-only";
import { cookies } from "next/headers";
import { isEphemeralMode } from "./storage/mode";
import { exportDemoSnapshot } from "./storage/demo-seed";
import { DEMO_SNAP_COOKIE } from "./cookie-names";

const MAX = 3500; // stay under typical 4KB cookie limits

/** Persist a compact snapshot cookie so SSR on another instance can rehydrate. */
export async function persistDemoSnapCookie(snap?: Record<string, unknown>) {
  if (!isEphemeralMode()) return false;
  const data = snap ?? exportDemoSnapshot();
  const tables = { ...(data.tables as Record<string, unknown[]> | undefined) };
  if (tables) {
    for (const k of ["webhook_deliveries", "enrichment_logs", "emails", "exports", "research_tasks", "bookings"]) {
      delete tables[k];
    }
    if (Array.isArray(tables.submissions) && tables.submissions.length > 40) {
      tables.submissions = tables.submissions.slice(-40);
    }
  }
  const slim = { ...data, tables };
  const encoded = Buffer.from(JSON.stringify(slim), "utf8").toString("base64url");
  if (encoded.length > MAX) return false;
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
