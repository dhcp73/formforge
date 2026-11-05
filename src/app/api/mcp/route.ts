import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { extractKey, verifyApiKey } from "@/lib/apikeys";
import { createMcpServer } from "@/lib/mcp/server";
import { localBackend } from "@/lib/mcp/local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version", "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS", "Access-Control-Expose-Headers": "Mcp-Session-Id" };

/** Stateless Streamable HTTP MCP endpoint. Auth: Bearer API key (each tool enforces the key's scopes). */
export async function POST(req: Request) {
  const auth = verifyApiKey(extractKey(req.headers));
  if (!auth) return Response.json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: send Authorization: Bearer ff_live_…" }, id: null }, { status: 401, headers: CORS });
  const server = createMcpServer(localBackend(auth.workspaceId, auth.scopes));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const res = await transport.handleRequest(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export function GET() {
  return Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST (stateless Streamable HTTP)." }, id: null }, { status: 405, headers: { ...CORS, Allow: "POST" } });
}
export const DELETE = GET;
export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
