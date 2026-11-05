import fs from "node:fs";
import path from "node:path";
import { sessionRoute } from "@/lib/app-route";
import { getDb, dataDir } from "@/lib/db";
import { notFound } from "@/lib/api";
export const runtime = "nodejs";
export const GET = sessionRoute<{ id: string }>((s, p) => {
  const e = (getDb().prepare("SELECT * FROM exports WHERE id = ? AND workspace_id = ?").get(p.id, s.workspace.id) as { filename: string } | undefined) ?? notFound("Export");
  const file = path.join(dataDir(), "exports", path.basename(e.filename));
  if (!fs.existsSync(file)) notFound("Export file");
  return new Response(fs.readFileSync(file), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${path.basename(e.filename)}"` } });
});
