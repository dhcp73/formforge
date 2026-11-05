import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Check } from "lucide-react";
export const metadata: Metadata = { title: "Features" };

const GROUPS = [
  { title: "Collect", items: ["Public POST endpoint per form (HTML, JSON/AJAX, multipart files up to 10 MB each)", "CORS, redirect-after-submit or JSON responses, hosted thank-you page", "Hosted form pages & iframe embeds generated from your schema", "Allowed-domain lists with wildcard support", "Open/close windows and submission caps"] },
  { title: "Protect", items: ["Honeypot field, per-IP rate limits and duplicate detection", "Explainable 0–100 spam score with reasons", "Disposable-email and MX checks", "Flag or reject spam per form; spam tab to review and restore"] },
  { title: "Understand", items: ["Schema-less fields with automatic type detection", "Optional schema: required, type, regex, length, rename/mapping, strict mode", "Enrichment waterfall: Apollo, Clay, Valyu, offline dataset, IP geo, AI", "Per-field source attribution, domain cache and cost/credit logs", "Fit score from AI ICP analysis or transparent heuristics"] },
  { title: "Act", items: ["Routing rules on any field incl. enrichment (14 operators)", "Round-robin assignment, tags, notifications, routing webhooks", "HMAC-signed webhooks with retries and delivery logs", "Email notifications and autoresponders (SMTP or outbox)", "Scheduled digests, CSV exports and webhook batches"] },
  { title: "Build", items: ["REST API with OpenAPI 3.1 and interactive reference", "Scoped, hashed API keys with rotation and last-used", "MCP server (stdio + Streamable HTTP) with 10 tools", "CSV/JSON exports, saved table views, bulk actions"] },
  { title: "Operate", items: ["Workspaces and multi-tenancy", "Continuous health monitor with incidents and alerts", "Public status page with uptime bars and latency sparklines", "Autonomous UI QA agent with reports in the dashboard"] },
];

export default function Features() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="max-w-2xl">
        <h1 className="text-[34px] font-semibold tracking-tight text-fg">Features</h1>
        <p className="mt-3 text-[15px] text-fg-muted">A complete pipeline from submit to signed webhook — with the depth RevOps teams and AI agents need.</p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <section key={g.title} className="rounded-xl border border-line bg-panel p-6">
            <h2 className="text-[15px] font-semibold text-fg">{g.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {g.items.map((i) => <li key={i} className="flex gap-2 text-[13.5px] text-fg-muted"><Check size={15} className="mt-0.5 shrink-0 text-accent" />{i}</li>)}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-12 flex flex-wrap gap-3"><ButtonLink href="/signup" variant="primary" size="lg">Start free</ButtonLink><ButtonLink href="/docs" size="lg">Browse docs</ButtonLink></div>
    </div>
  );
}
