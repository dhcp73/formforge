import { apiRoute, optionsHandler, notFound } from "@/lib/api";
import { getForm } from "@/lib/forms";
import { exportSubmissions, toCsv } from "@/lib/submissions";
import { publicSubmission } from "@/lib/processing";
export const dynamic = "force-dynamic";
export const GET = apiRoute("submissions:read", async ({ auth, params, url }) => {
  const form = getForm(auth.workspaceId, params.formId) ?? notFound("Form");
  const spam = (url.searchParams.get("spam") as "true" | "false" | "all") ?? "false";
  const rows = exportSubmissions(auth.workspaceId, form.id, { since: url.searchParams.get("since") ?? undefined, spam });
  const fmt = url.searchParams.get("format") === "json" ? "json" : "csv";
  const name = `${form.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.${fmt}`;
  if (fmt === "json") return new Response(JSON.stringify(rows.map(publicSubmission), null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${name}"` } });
  return new Response(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
});
export const OPTIONS = optionsHandler;
