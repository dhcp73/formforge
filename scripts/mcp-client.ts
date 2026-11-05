/**
 * MCP smoke client: connects to BOTH transports and calls tools.
 *   FORMFORGE_API_KEY=… [FORMFORGE_URL=http://localhost:3100] npm run mcp:client
 */
import fs from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.FORMFORGE_URL ?? "http://localhost:3100";
const key = process.env.FORMFORGE_API_KEY ?? (fs.existsSync("data/demo-api-key.txt") ? fs.readFileSync("data/demo-api-key.txt", "utf8").trim() : "");
if (!key) { console.error("Set FORMFORGE_API_KEY"); process.exit(1); }
const text = (r: unknown) => ((r as { content: { text: string }[] }).content?.[0]?.text ?? "");

async function exercise(name: string, client: Client) {
  const tools = await client.listTools();
  console.log(`\n[${name}] ${tools.tools.length} tools: ${tools.tools.map((t) => t.name).join(", ")}`);
  const forms = JSON.parse(text(await client.callTool({ name: "list_forms", arguments: {} })));
  console.log(`[${name}] list_forms → ${forms.data.length} forms (${forms.data.map((f: { name: string }) => f.name).join(", ")})`);
  const stats = JSON.parse(text(await client.callTool({ name: "get_stats", arguments: {} })));
  console.log(`[${name}] get_stats → total=${stats.total} spamRate=${stats.spamRate}%`);
  if (forms.data[0]) {
    const subs = JSON.parse(text(await client.callTool({ name: "list_submissions", arguments: { form_id: forms.data[0].id, limit: 3 } })));
    console.log(`[${name}] list_submissions → ${subs.data.length} of ${subs.total}`);
    const found = JSON.parse(text(await client.callTool({ name: "search_submissions", arguments: { query: "stripe", limit: 5 } })));
    console.log(`[${name}] search_submissions("stripe") → ${found.total} matches`);
  }
  const research = await client.callTool({ name: "research_company", arguments: { domain: "stripe.com" } });
  console.log(`[${name}] research_company → ${research.isError ? "error (expected without VALYU_API_KEY): " : ""}${text(research).slice(0, 120)}`);
  return tools.tools.length;
}

const http = new Client({ name: "formforge-smoke-http", version: "1.0.0" });
await http.connect(new StreamableHTTPClientTransport(new URL(`${url}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
const n1 = await exercise("http", http);
await http.close();

const stdio = new Client({ name: "formforge-smoke-stdio", version: "1.0.0" });
await stdio.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", "scripts/mcp-stdio.ts"], env: { ...process.env, FORMFORGE_API_KEY: key, FORMFORGE_URL: url } as Record<string, string>, stderr: "inherit" }));
const n2 = await exercise("stdio", stdio);
await stdio.close();
console.log(`\nMCP OK — http: ${n1} tools, stdio: ${n2} tools`);
