import { exportDemoSnapshot, ensureDemoSeed } from "@/lib/storage/demo-seed";
import { isEphemeralMode, demoModeLabel } from "@/lib/db";
import { persistDemoSnapCookie } from "@/lib/demo-cookie";

export async function GET() {
  if (!isEphemeralMode()) return Response.json({ error: "Snapshot only available in STORAGE_MODE=browser|memory" }, { status: 400 });
  ensureDemoSeed();
  const snap = { ...exportDemoSnapshot(), label: demoModeLabel() };
  await persistDemoSnapCookie(snap);
  return Response.json(snap);
}
