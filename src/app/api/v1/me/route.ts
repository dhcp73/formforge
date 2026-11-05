import { apiRoute, optionsHandler } from "@/lib/api";
import { getDb } from "@/lib/db";
export const dynamic = "force-dynamic";
export const GET = apiRoute(null, async ({ auth }) => {
  const ws = getDb().prepare("SELECT id, name, plan FROM workspaces WHERE id = ?").get(auth.workspaceId);
  return { key_id: auth.keyId, workspace: ws, scopes: auth.scopes };
});
export const OPTIONS = optionsHandler;
