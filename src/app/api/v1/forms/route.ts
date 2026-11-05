import { apiRoute, optionsHandler, readJson } from "@/lib/api";
import { svc } from "@/lib/service";
export const dynamic = "force-dynamic";
export const GET = apiRoute("forms:read", async ({ auth }) => ({ data: svc.listForms(auth.workspaceId) }));
export const POST = apiRoute("forms:write", async ({ auth, req }) => {
  const b = await readJson(req);
  return Response.json(svc.createForm(auth.workspaceId, { name: String(b.name ?? ""), description: b.description as string | undefined, settings: b.settings as Record<string, unknown> | undefined }), { status: 201 });
});
export const OPTIONS = optionsHandler;
