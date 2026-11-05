#!/usr/bin/env node
/**
 * FormForge MCP server over stdio. Talks to a FormForge instance through the REST API.
 *   FORMFORGE_API_KEY=ff_live_… FORMFORGE_URL=http://localhost:3100 npm run --silent mcp
 * Logs go to stderr (stdout is the protocol channel).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "@/lib/mcp/server";
import { httpBackend } from "@/lib/mcp/backend";

const key = process.env.FORMFORGE_API_KEY;
const url = process.env.FORMFORGE_URL ?? "http://localhost:3100";
if (!key) { console.error("FORMFORGE_API_KEY is required (create one in Dashboard → API & keys)"); process.exit(1); }
const server = createMcpServer(httpBackend(url, key));
await server.connect(new StdioServerTransport());
console.error(`[formforge-mcp] stdio server ready → ${url}`);
