import Link from "next/link";
import { Logo } from "@/components/logo";

const COLS = [
  { title: "Product", links: [["Features", "/features"], ["Pricing", "/pricing"], ["Changelog", "/changelog"], ["Status", "/status"]] },
  { title: "Developers", links: [["Documentation", "/docs"], ["Quickstart", "/docs/quickstart"], ["API reference", "/docs/api"], ["MCP server", "/docs/mcp"]] },
  { title: "Integrations", links: [["Apollo.io", "/docs/integrations/apollo"], ["Clay", "/docs/integrations/clay"], ["Valyu", "/docs/integrations/valyu"], ["OpenAI & OpenRouter", "/docs/integrations/openai"]] },
  { title: "Company", links: [["About", "/about"], ["Sign up", "/signup"], ["Log in", "/login"]] },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-panel">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-[13px] text-fg-subtle">The form backend for teams that care about every lead. Built with Next.js, open APIs and MCP.</p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">{c.title}</p>
            <ul className="mt-3 space-y-2">
              {c.links.map(([l, h]) => <li key={h}><Link href={h} className="text-[13px] text-fg-muted hover:text-fg">{l}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[12px] text-fg-subtle sm:px-6">
          <span>© {new Date().getFullYear()} FormForge. All rights reserved.</span>
          <span>Made for developers, RevOps and AI agents.</span>
        </div>
      </div>
    </footer>
  );
}
