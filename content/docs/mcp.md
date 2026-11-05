# MCP server

FormForge includes a [Model Context Protocol](https://modelcontextprotocol.io) server, so AI agents such as Cursor or Claude can read, create and act on your forms and leads.

## Tools

| Tool | Description |
|---|---|
| `list_forms` | Forms with endpoints and counts |
| `get_form` | One form with its settings |
| `create_form` | Create a form (name, redirect, notify emails, fields) |
| `list_submissions` | Recent submissions (form, spam, limit) |
| `search_submissions` | Full-text search with filters (owner, min fit) |
| `get_submission` | Answers, enrichment with sources, routing and spam |
| `create_webhook` | Add a webhook to a form |
| `enrich_submission` | Re-run enrichment and routing |
| `research_company` | Valyu Search, or start DeepResearch, on a domain |
| `get_stats` | Totals, spam rate, owners, provider hit rates |

Each tool checks the API key's scopes, so a read-only key can't create forms.

## Remote (Streamable HTTP)

```json
{
  "mcpServers": {
    "formforge": {
      "url": "{{BASE}}/api/mcp",
      "headers": { "Authorization": "Bearer ff_live_…" }
    }
  }
}
```

In **Cursor**, add this under *Settings → MCP*, or in `~/.cursor/mcp.json`. In **Claude Desktop**, use the stdio config below, or `npx mcp-remote {{BASE}}/api/mcp --header "Authorization: Bearer ff_live_…"`.

## Local (stdio)

```json
{
  "mcpServers": {
    "formforge": {
      "command": "npm",
      "args": ["run", "--silent", "mcp", "--prefix", "/path/to/formforge"],
      "env": { "FORMFORGE_API_KEY": "ff_live_…", "FORMFORGE_URL": "{{BASE}}" }
    }
  }
}
```

The stdio server calls the REST API with your key, so it works against any FormForge instance, local or remote.

## Try it

```bash
FORMFORGE_API_KEY=ff_live_… npm run mcp:client   # lists tools and calls list_forms + get_stats
```
