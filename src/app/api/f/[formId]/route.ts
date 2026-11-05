import { handleSubmissionRequest, corsHeaders } from "@/lib/ingest";
import { publicUrl } from "@/lib/enrich/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function baseFrom(req: Request) {
  if (process.env.PUBLIC_URL) return publicUrl();
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  return `${req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "")}://${host}`;
}

export async function POST(req: Request, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  return handleSubmissionRequest(req, formId, baseFrom(req));
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function GET(req: Request, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  return Response.json({ ok: false, message: `This is a FormForge form endpoint. Send a POST request (HTML form, multipart or JSON) to ${baseFrom(req)}/api/f/${formId}.` }, { status: 405, headers: { Allow: "POST, OPTIONS" } });
}
