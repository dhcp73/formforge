import fs from "node:fs";
import { notFound } from "./api";
import { getSubmission } from "./submissions";
export function fileResponse(ws: string, id: string, index: string) {
  const s = getSubmission(ws, id) ?? notFound("Submission");
  const f = s.files[Number(index)] ?? notFound("File");
  if (!fs.existsSync(f.path)) notFound("File");
  return new Response(fs.readFileSync(f.path), { headers: { "Content-Type": f.type, "Content-Disposition": `attachment; filename="${f.name.replace(/"/g, "")}"`, "X-Content-Type-Options": "nosniff" } });
}
