import type { Metadata } from "next";
import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
export const metadata: Metadata = { title: "Pricing" };

const PLANS = [
  { name: "Free", price: "$0", per: "forever", cta: "Start free", features: ["Unlimited forms", "500 submissions / mo", "Spam protection (spam never counts)", "Offline enrichment + IP geo", "REST API & MCP", "1 workspace"] },
  { name: "Pro", price: "$12", per: "/ month", cta: "Start Pro trial", highlight: true, features: ["5,000 submissions / mo", "Apollo, Clay, Valyu & AI providers (BYO keys)", "Routing rules & round-robin", "Signed webhooks + retries", "Scheduled digests & exports", "File uploads (10 MB/file)"] },
  { name: "Business", price: "$49", per: "/ month", cta: "Choose Business", features: ["25,000 submissions / mo", "Unlimited workspaces & members", "DeepResearch account briefs", "Status page & alerts", "Priority support", "$4 per extra 1,000 — no cliffs"] },
  { name: "Enterprise", price: "Custom", per: "", cta: "Talk to us", features: ["SSO / SAML", "Data residency & DPA", "Dedicated infrastructure", "Uptime SLA", "Migration help", "Self-host license"] },
];

export default function Pricing() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-[34px] font-semibold tracking-tight text-fg">Simple, linear pricing</h1>
        <p className="mt-3 text-[15px] text-fg-muted">Unlimited forms on every plan. Spam never counts toward your quota. No plan cliffs — overages are billed per thousand.</p>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => (
          <div key={p.name} className={"flex flex-col rounded-xl border bg-panel p-6 " + (p.highlight ? "border-accent shadow-[0_20px_50px_-25px_rgb(79_70_229/0.5)]" : "border-line")}>
            <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold text-fg">{p.name}</h2>{p.highlight && <Badge tone="indigo">Most popular</Badge>}</div>
            <div className="mt-4 flex items-baseline gap-1"><span className="text-[32px] font-semibold tracking-tight text-fg">{p.price}</span><span className="text-[13px] text-fg-subtle">{p.per}</span></div>
            <ul className="mt-6 flex-1 space-y-2.5">
              {p.features.map((f) => <li key={f} className="flex gap-2 text-[13.5px] text-fg-muted"><Check size={15} className="mt-0.5 shrink-0 text-accent" />{f}</li>)}
            </ul>
            <ButtonLink href={p.name === "Enterprise" ? "/about" : "/signup"} variant={p.highlight ? "primary" : "secondary"} className="mt-6 w-full">{p.cta}</ButtonLink>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-[12.5px] text-fg-subtle">Self-hosted locally, every feature is unlocked. Prices shown are the proposed hosted plans.</p>
    </div>
  );
}
