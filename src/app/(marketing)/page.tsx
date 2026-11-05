import Link from "next/link";
import { ArrowRight, Braces, Bot, CalendarClock, Fingerprint, GitBranch, KeyRound, Layers, ShieldCheck, Sparkles, Webhook, Zap, Check, Minus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/copy";
import { ProductMock } from "@/components/marketing/product-mock";

const FEATURES = [
  { icon: Layers, title: "Schema-less, then strict", body: "Accept any field on day one. Types are auto-detected; add a schema with required, regex and renames when you're ready." },
  { icon: Sparkles, title: "Enrichment waterfall", body: "Apollo → Clay → Valyu → offline dataset → IP geo → AI. Every field keeps its source, cached by domain with cost logs." },
  { icon: GitBranch, title: "Lead routing", body: "Route on company size, country, intent or fit score. Round-robin reps, tag, notify and fire webhooks — with a full decision timeline." },
  { icon: ShieldCheck, title: "Explainable spam scoring", body: "Honeypot, rate limits, duplicate detection, disposable domains, MX checks and keyword heuristics — with reasons you can read." },
  { icon: Webhook, title: "Signed webhooks with retries", body: "HMAC-SHA256 signatures, exponential backoff, delivery logs and one-click redelivery. No more silent failures." },
  { icon: CalendarClock, title: "Scheduling built in", body: "Open/close windows, submission caps, cron digests, scheduled CSV exports and webhook batches on a durable job queue." },
  { icon: Braces, title: "Developer REST API", body: "Full CRUD, filters, pagination and exports with an OpenAPI 3.1 spec and interactive reference." },
  { icon: KeyRound, title: "Scoped API keys", body: "Hashed at rest, prefix shown, six scopes, last-used tracking, one-click rotate and revoke." },
  { icon: Bot, title: "MCP server for AI agents", body: "Let Claude, Cursor or ChatGPT list forms, search leads, enrich and research companies — over stdio or HTTP." },
];

const COMPARE: [string, boolean | string, boolean | string][] = [
  ["Schema-less fields + optional validation", true, "Validation only"],
  ["Per-field enrichment with source attribution", true, false],
  ["Apollo, Clay, Valyu & LLM providers", true, false],
  ["Lead routing with round-robin + timeline", true, false],
  ["Explainable spam score (with reasons)", true, "Opaque"],
  ["Signed webhooks + retries + delivery log", true, "Limited"],
  ["Scheduled digests, exports & form windows", true, false],
  ["Hosted form pages + HTML/JSON/multipart", true, "Bring your own form"],
  ["OpenAPI spec + scoped API keys", true, "Partial"],
  ["Public status page & health monitoring", true, false],
];

const html = `<form action="https://your-app/api/f/YOUR_FORM_ID" method="POST">
  <input name="name" placeholder="Name" />
  <input name="email" type="email" required />
  <input name="company_size" />          <!-- any field works -->
  <input name="_gotcha" style="display:none" /> <!-- honeypot -->
  <button type="submit">Send</button>
</form>`;

function Cell({ v }: { v: boolean | string }) {
  if (v === true) return <Check size={16} className="mx-auto text-emerald-600" aria-label="Yes" />;
  if (v === false) return <Minus size={16} className="mx-auto text-fg-subtle" aria-label="No" />;
  return <span className="text-[12.5px] text-fg-subtle">{v}</span>;
}

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <Link href="/changelog" className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[12.5px] text-fg-muted shadow-sm hover:text-fg">
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10.5px] font-semibold text-white">NEW</span> Valyu DeepResearch + status page <ArrowRight size={13} />
            </Link>
            <h1 className="text-balance mt-6 text-[36px] font-semibold leading-[1.08] tracking-tight text-fg sm:text-[56px]">The form backend that <span className="text-accent">qualifies every lead</span>.</h1>
            <p className="text-balance mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-fg-muted sm:text-[17px]">Point any HTML, React or AI-generated form at FormForge. We block spam, enrich every submission, route it to the right rep and push it anywhere — with an API and MCP server your agents can use.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/signup" variant="primary" size="lg">Start free <ArrowRight size={15} /></ButtonLink>
              <ButtonLink href="/docs/quickstart" size="lg">Read the quickstart</ButtonLink>
            </div>
            <p className="mt-4 text-[12.5px] text-fg-subtle">No credit card · Unlimited forms on every plan · Runs locally in one command</p>
          </div>
          <div className="mx-auto mt-14 max-w-5xl"><ProductMock /></div>
        </div>
      </section>

      <section className="border-b border-line bg-panel">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 text-center sm:grid-cols-4 sm:px-6">
          {[["< 50 ms", "median ingest latency"], ["6", "enrichment sources"], ["14", "routing operators"], ["10", "MCP tools"]].map(([a, b]) => (
            <div key={b}><div className="text-[24px] font-semibold tracking-tight text-fg">{a}</div><div className="mt-1 text-[12.5px] text-fg-subtle">{b}</div></div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-[12.5px] font-semibold uppercase tracking-wide text-accent">Platform</p>
          <h2 className="mt-2 text-[28px] font-semibold tracking-tight text-fg sm:text-[34px]">Everything after “Submit”, done properly.</h2>
          <p className="mt-3 text-[15px] text-fg-muted">Formcarry-style simplicity on the front, a revenue-grade pipeline behind it.</p>
        </div>
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-panel p-6">
              <f.icon size={18} className="text-accent" />
              <h3 className="mt-3 text-[14.5px] font-semibold text-fg">{f.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-panel">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-accent">Three-minute setup</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-tight text-fg">Keep your markup. Swap the action.</h2>
            <ol className="mt-6 space-y-4 text-[14px] text-fg-muted">
              {["Create a form in the dashboard, via API or by asking your AI agent over MCP.", "Point your form's action (or fetch call) at the endpoint. HTML, JSON and multipart files all work.", "Watch submissions arrive enriched, scored and routed — then wire webhooks, digests and exports."].map((t, i) => (
                <li key={i} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">{i + 1}</span><span>{t}</span></li>
              ))}
            </ol>
            <div className="mt-6 flex gap-3"><ButtonLink href="/docs/quickstart" variant="primary">Quickstart</ButtonLink><ButtonLink href="/docs/api">API reference</ButtonLink></div>
          </div>
          <CodeBlock code={html} lang="html" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-accent">Enrichment waterfall</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-tight text-fg">Every field knows where it came from.</h2>
            <p className="mt-3 text-[14.5px] text-fg-muted">Providers run in priority order with per-provider timeouts and fallbacks. Missing keys disable a step gracefully — offline enrichment always works.</p>
          </div>
          <div className="space-y-2">
            {[["Apollo.io", "Person + organization match", "1"], ["Clay", "Table webhook → signed callback", "2"], ["Valyu", "Search now, DeepResearch async", "3"], ["Offline dataset", "Bundled company data, zero cost", "4"], ["IP geolocation", "Offline GeoLite data", "5"], ["AI (OpenAI / OpenRouter)", "Summary, intent, ICP fit via Vercel AI SDK", "6"]].map(([a, b, n]) => (
              <div key={a} className="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-[12px] font-semibold text-fg-muted">{n}</span>
                <div className="min-w-0 flex-1"><div className="text-[13.5px] font-medium text-fg">{a}</div><div className="text-[12.5px] text-fg-subtle">{b}</div></div>
                <Zap size={14} className="text-accent" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-panel">
        <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-[28px] font-semibold tracking-tight text-fg">FormForge vs. a classic form backend</h2>
          <div className="mt-8 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[520px] text-[13.5px]">
              <thead className="bg-subtle text-left text-[12px] uppercase tracking-wide text-fg-subtle">
                <tr><th className="px-4 py-3 font-medium">Capability</th><th className="px-4 py-3 text-center font-medium">FormForge</th><th className="px-4 py-3 text-center font-medium">Typical backend</th></tr>
              </thead>
              <tbody>
                {COMPARE.map(([k, a, b]) => (
                  <tr key={k} className="border-t border-line"><td className="px-4 py-2.5 text-fg">{k}</td><td className="px-4 py-2.5 text-center"><Cell v={a} /></td><td className="px-4 py-2.5 text-center"><Cell v={b} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-line bg-panel p-6">
            <Fingerprint size={18} className="text-accent" />
            <h3 className="mt-3 text-[16px] font-semibold text-fg">Built for AI agents</h3>
            <p className="mt-2 text-[13.5px] text-fg-muted">Ten MCP tools — create forms, search and enrich submissions, research companies with Valyu — authenticated with a scoped API key.</p>
            <CodeBlock className="mt-4" lang="json" code={`{ "mcpServers": { "formforge": {\n  "url": "http://localhost:3100/api/mcp",\n  "headers": { "Authorization": "Bearer ff_live_…" }\n} } }`} />
          </div>
          <div className="rounded-xl border border-line bg-panel p-6">
            <Braces size={18} className="text-accent" />
            <h3 className="mt-3 text-[16px] font-semibold text-fg">A real developer API</h3>
            <p className="mt-2 text-[13.5px] text-fg-muted">OpenAPI 3.1, scoped keys, filters, pagination, exports, webhooks, schedules and routing rules.</p>
            <CodeBlock className="mt-4" lang="bash" code={`curl http://localhost:3100/api/v1/forms/FORM_ID/submissions?min_fit=70 \\\n  -H "Authorization: Bearer ff_live_…"`} />
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-zinc-950 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-20 text-center sm:px-6">
          <h2 className="text-balance text-[30px] font-semibold tracking-tight">Stop losing leads after the submit button.</h2>
          <p className="mt-3 max-w-xl text-[15px] text-zinc-400">Spin it up locally in a minute. Bring your own keys for Apollo, Clay, Valyu and AI — or run fully offline.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/signup" variant="primary" size="lg">Create your workspace</ButtonLink>
            <ButtonLink href="/pricing" size="lg" className="border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800">See pricing</ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
