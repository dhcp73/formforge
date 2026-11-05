import { publicBookSubmission } from "@/lib/calendar";
import { errorResponse, ApiError, readJson } from "@/lib/api";

/** Public (no API key): book a slot for a submission's assigned owner. */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const submissionId = String(body.submissionId ?? body.submission_id ?? "");
    const start = String(body.start ?? "");
    const end = String(body.end ?? "");
    if (!submissionId || !start || !end) throw new ApiError(400, "submissionId, start and end are required", "bad_request");
    const result = await publicBookSubmission(submissionId, start, end);
    return Response.json({ ok: true, ...result, meet_url: result.meetUrl });
  } catch (e) { return errorResponse(e); }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept" } });
}
