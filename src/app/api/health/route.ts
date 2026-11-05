export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ status: "ok", service: "formforge", time: new Date().toISOString(), uptime_s: Math.round(process.uptime()) });
}
