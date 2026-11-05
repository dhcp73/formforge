import { publicSlotsForSubmission } from "@/lib/calendar";
import { errorResponse, ApiError } from "@/lib/api";

/** Public (no API key): slots for the owner assigned to a submission. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const submissionId = url.searchParams.get("submissionId") || url.searchParams.get("submission_id");
    if (!submissionId) throw new ApiError(400, "submissionId is required", "bad_request");
    const result = await publicSlotsForSubmission(submissionId);
    return Response.json(result);
  } catch (e) { return errorResponse(e); }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept" } });
}
