export const dynamic = "force-static";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>API reference · FormForge</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<script>
  // follow the site theme (next-themes stores it in localStorage "theme"; default light)
  (function () { try { var t = localStorage.getItem("theme"); window.__ffDark = t === "dark"; if (window.__ffDark) document.documentElement.classList.add("dark"); } catch (e) { window.__ffDark = false; } })();
</script>
<style>
  :root { color-scheme: light; } html.dark { color-scheme: dark; }
  body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .ff-bar { position: sticky; top: 0; z-index: 100; display: flex; align-items: center; gap: 16px; height: 48px; padding: 0 16px; border-bottom: 1px solid #e4e4e7; background: #fff; font-size: 13px; }
  .ff-bar a { color: #3f3f46; text-decoration: none; } .ff-bar a:hover { color: #18181b; }
  .ff-bar a:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; border-radius: 4px; }
  .ff-brand { display: flex; align-items: center; gap: 8px; font-weight: 600; color: #18181b !important; }
  .ff-spacer { flex: 1; }
  html.dark .ff-bar { background: #0b0b0e; border-color: #27272a; } html.dark .ff-bar a { color: #a1a1aa; } html.dark .ff-brand, html.dark .ff-bar a:hover { color: #fafafa !important; }
  @media (max-width: 520px) { .ff-hide-sm { display: none; } }
</style>
</head>
<body>
<nav class="ff-bar" aria-label="FormForge">
  <a class="ff-brand" href="/"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#4f46e5"/><path d="M7 7h10M7 12h7M7 17h4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>FormForge API</a>
  <span class="ff-spacer"></span>
  <a href="/docs">Docs</a>
  <a class="ff-hide-sm" href="/docs/api-keys">API keys</a>
  <a class="ff-hide-sm" href="/docs/mcp">MCP</a>
  <a href="/api/v1/openapi.json">OpenAPI JSON</a>
  <a href="/dashboard">Dashboard</a>
</nav>
<main id="app"></main>
<script src="/vendor/scalar.js"></script>
<script>
  Scalar.createApiReference('#app', {
    url: '/api/v1/openapi.json',
    withDefaultFonts: false,
    darkMode: !!window.__ffDark,
    forceDarkModeState: window.__ffDark ? 'dark' : 'light',
    hideDarkModeToggle: true,
    hideClientButton: false,
    defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
    authentication: { preferredSecurityScheme: 'bearerAuth' },
    metaData: { title: 'FormForge API reference' },
  });
</script>
</body>
</html>`;

export function GET() {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
