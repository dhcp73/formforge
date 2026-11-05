import { sessionRoute } from "@/lib/app-route";
import { getForm } from "@/lib/forms";
import { exportSubmissions, toCsv } from "@/lib/submissions";
import { notFound } from "@/lib/api";
export const runtime = "nodejs";
export const GET = sessionRoute<{ formId: string }>((s, p, req) => {
  const form = getForm(s.workspace.id, p.formId) ?? notFound("Form");
  const u = new URL(req.url);
  const spam = u.searchParams.get("spam");
  const rows = exportSubmissions(s.workspace.id, form.id, { spam: spam === "true" || spam === "all" ? spam : "false" });
  const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || form.id;
  if (u.searchParams.get("format") === "json") return new Response(JSON.stringify(rows, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${slug}.json"` } });
  return new Response(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}.csv"` } });
});
