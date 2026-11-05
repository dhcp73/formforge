import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
export const metadata: Metadata = { title: "About" };
export default function About() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-[34px] font-semibold tracking-tight text-fg">About FormForge</h1>
      <div className="prose prose-zinc dark:prose-invert mt-6 max-w-none text-[15px]">
        <p>Form backends solved the easy part: getting a POST request into an inbox. The hard part starts after that — spam, missing context, slow follow-up, silent integration failures and limits that punish growth.</p>
        <p>FormForge treats every submission as a lead. It is accepted without a schema, scored for spam with reasons you can read, enriched through a waterfall of providers with per-field attribution, routed to the right person, and delivered through signed, retried webhooks. Everything is available through a documented API and an MCP server so AI agents are first-class users.</p>
        <p>The whole platform runs locally on SQLite with a single command, and is designed to scale out to a hosted, multi-tenant service.</p>
        <h2>Contact</h2>
        <p>For enterprise, migration or self-host licensing, email <a href="mailto:hello@formforge.dev">hello@formforge.dev</a>.</p>
      </div>
      <div className="mt-8 flex gap-3"><ButtonLink href="/signup" variant="primary">Create a workspace</ButtonLink><ButtonLink href="/docs">Documentation</ButtonLink></div>
    </div>
  );
}
