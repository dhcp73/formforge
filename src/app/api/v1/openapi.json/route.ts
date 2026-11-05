import { openApiDocument } from "@/lib/openapi";
import { publicUrl } from "@/lib/enrich/pipeline";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  const base = process.env.PUBLIC_URL ? publicUrl() : new URL(req.url).origin;
  return Response.json(openApiDocument(base), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
}
