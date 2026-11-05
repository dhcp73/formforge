import { exportDemoSnapshot } from "@/lib/storage/demo-seed";
import { isEphemeralMode, demoModeLabel } from "@/lib/db";
import { ensureDemoSeed } from "@/lib/storage/demo-seed";

export function GET() {
  if (!isEphemeralMode()) return Response.json({ error: "Snapshot only available in STORAGE_MODE=browser|memory" }, { status: 400 });
  ensureDemoSeed();
  return Response.json({ ...exportDemoSnapshot(), label: demoModeLabel() });
}
