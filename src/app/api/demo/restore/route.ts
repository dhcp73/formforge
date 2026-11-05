import { importDemoSnapshot, ensureDemoSeed } from "@/lib/storage/demo-seed";
import { isEphemeralMode } from "@/lib/db";

export async function POST(req: Request) {
  if (!isEphemeralMode()) return Response.json({ error: "Restore only available in STORAGE_MODE=browser|memory" }, { status: 400 });
  ensureDemoSeed();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid snapshot" }, { status: 400 });
  importDemoSnapshot(body as { tables?: Record<string, Record<string, unknown>[]> });
  return Response.json({ ok: true });
}
