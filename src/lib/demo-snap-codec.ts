import zlib from "node:zlib";

const MAX = 3900;

function slimSnapshot(snap: Record<string, unknown>): Record<string, unknown> {
  const tables = { ...(snap.tables as Record<string, unknown[]> | undefined) };
  if (tables) {
    for (const k of ["webhook_deliveries", "enrichment_logs", "emails", "exports", "research_tasks", "bookings"]) {
      delete tables[k];
    }
    if (Array.isArray(tables.submissions) && tables.submissions.length > 20) {
      tables.submissions = tables.submissions.slice(-20);
    }
  }
  return { v: 1, tables };
}

export function encodeDemoSnap(snap: Record<string, unknown>): string | null {
  const slim = slimSnapshot(snap);
  const z = zlib.deflateSync(Buffer.from(JSON.stringify(slim), "utf8"));
  const encoded = `z1.${z.toString("base64url")}`;
  if (encoded.length > MAX) return null;
  return encoded;
}

export function decodeDemoSnap(raw: string): { tables?: Record<string, Array<Record<string, unknown>>> } | null {
  try {
    if (raw.startsWith("z1.")) {
      const buf = zlib.inflateSync(Buffer.from(raw.slice(3), "base64url"));
      return JSON.parse(buf.toString("utf8"));
    }
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
