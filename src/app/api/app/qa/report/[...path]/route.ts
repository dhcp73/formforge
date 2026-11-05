import fs from "node:fs";
import path from "node:path";
import { sessionRoute } from "@/lib/app-route";
import { notFound } from "@/lib/api";
export const runtime = "nodejs";
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".png": "image/png", ".css": "text/css" };
export const GET = sessionRoute<{ path: string[] }>((_s, p) => {
  const root = path.resolve(process.cwd(), "reports", "ui-agent");
  const file = path.resolve(root, ...p.path);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) notFound("Report file");
  return new Response(fs.readFileSync(file), { headers: { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" } });
});
