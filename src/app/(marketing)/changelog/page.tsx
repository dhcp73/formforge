import type { Metadata } from "next";
import { Badge } from "@/components/ui/primitives";
export const metadata: Metadata = { title: "Changelog" };

const ENTRIES = [
  { date: "Nov 5, 2026", tag: "Launch", title: "FormForge 1.0", items: ["Form endpoints with HTML, JSON and multipart uploads", "Schema-less fields, auto type detection and optional validation", "Developer REST API, OpenAPI 3.1 spec and interactive reference", "Scoped, hashed API keys with rotation"] },
  { date: "Nov 5, 2026", tag: "Enrichment", title: "Provider waterfall", items: ["Apollo.io person + organization enrichment", "Clay webhook push with signed callback merge", "Valyu Search and async DeepResearch with structured output", "AI enrichment via Vercel AI SDK (OpenAI + OpenRouter) and OpenAI SDK engine"] },
  { date: "Nov 5, 2026", tag: "Automation", title: "Routing, webhooks and schedules", items: ["Routing rules with round-robin, tags, notifications and timeline", "HMAC-signed webhooks with retries and delivery logs", "Cron digests, CSV exports and webhook batches"] },
  { date: "Nov 5, 2026", tag: "Platform", title: "Status page, MCP and QA agent", items: ["Continuous health monitor with incidents and public status page", "MCP server over stdio and Streamable HTTP", "Autonomous Playwright UI agent with HTML reports"] },
];

export default function Changelog() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-[34px] font-semibold tracking-tight text-fg">Changelog</h1>
      <p className="mt-3 text-[15px] text-fg-muted">What&apos;s new in FormForge.</p>
      <ol className="mt-10 space-y-10 border-l border-line pl-6">
        {ENTRIES.map((e) => (
          <li key={e.title} className="relative">
            <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-accent" />
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle"><time>{e.date}</time><Badge tone="indigo">{e.tag}</Badge></div>
            <h2 className="mt-2 text-[17px] font-semibold text-fg">{e.title}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] text-fg-muted">{e.items.map((i) => <li key={i}>{i}</li>)}</ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
