import { Link2, Building2, Globe2, MapPin, Users, Briefcase, Mail, Monitor, Paperclip, Sparkles, CheckCircle2, XCircle, CircleDashed } from "lucide-react";
import type { SubmissionRecord } from "@/lib/types";
import type { Enrichment } from "@/lib/enrich/types";
import { Badge, Card, DL, type Tone } from "@/components/ui/primitives";
import { RecordActions, RecordTabs } from "./record-ui";
import { CodeBlock } from "@/components/ui/copy";
import { displayName, fmtDate, fmtValue, timeAgo } from "@/lib/format";
import { countryName } from "@/lib/enrich/local";
import { listDeliveries } from "@/lib/webhooks";

export const SOURCE_TONE: Record<string, Tone> = { apollo: "indigo", clay: "amber", valyu: "violet", offline: "gray", ipgeo: "blue", ai: "green", email: "gray", useragent: "gray" };
export const SOURCE_LABEL: Record<string, string> = { apollo: "Apollo", clay: "Clay", valyu: "Valyu", offline: "Offline", ipgeo: "IP geo", ai: "AI", email: "Email check", useragent: "User-agent" };

/** Deterministic avatar hue from a string (no third-party logo requests, so lead domains never leak). */
const hue = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };

export function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  return <Badge tone={SOURCE_TONE[source] ?? "gray"}>{SOURCE_LABEL[source] ?? source}</Badge>;
}

export function FitRing({ score, size = 48 }: { score: number | null; size?: number }) {
  const v = score ?? 0;
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = score == null ? "#a1a1aa" : v >= 75 ? "#10b981" : v >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Fit score ${score ?? "unknown"} out of 100`}>
      <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} stroke="var(--muted)" strokeWidth="5" fill="none" /><circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="5" fill="none" strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} strokeLinecap="round" /></svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold tabular-nums text-fg">{score ?? "—"}</span>
    </div>
  );
}

function Attr({ e, path }: { e: Enrichment; path: string }) { return <SourceBadge source={e.attribution?.[path]} />; }

export function CompanyCard({ e }: { e: Enrichment }) {
  const c = (e.company ?? {}) as Record<string, string | number | undefined>;
  if (!c.domain && !c.name) return <Card className="p-4 text-[12.5px] text-fg-subtle">No company detected (free or missing email domain).</Card>;
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.domain || c.name ? <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[14px] font-semibold text-white" style={{ background: `hsl(${hue(String(c.domain ?? c.name))} 55% 34%)` }}>{String(c.name ?? c.domain).slice(0, 1).toUpperCase()}</span> : <Building2 size={36} className="text-fg-subtle" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-semibold text-fg">{c.name ?? c.domain}</span><Attr e={e} path="company.name" /></div>
          {c.domain && <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="text-[12.5px] text-accent hover:underline">{c.domain}</a>}
          {c.description && <p className="mt-1.5 text-[12.5px] text-fg-muted">{String(c.description)}</p>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
        <div className="flex items-center gap-1.5 text-fg-muted"><Users size={13} />{c.employees ? `${Number(c.employees).toLocaleString()} employees` : "Size unknown"} <Attr e={e} path="company.employees" /></div>
        <div className="flex items-center gap-1.5 text-fg-muted"><Briefcase size={13} />{c.industry ?? "Industry unknown"} <Attr e={e} path="company.industry" /></div>
        <div className="flex items-center gap-1.5 text-fg-muted"><MapPin size={13} />{[c.city, c.country && countryName(String(c.country))].filter(Boolean).join(", ") || "HQ unknown"} <Attr e={e} path="company.country" /></div>
        <div className="flex items-center gap-1.5 text-fg-muted"><Link2 size={13} />{c.linkedin ? <a href={String(c.linkedin)} target="_blank" rel="noreferrer" className="text-accent hover:underline">LinkedIn</a> : "—"}</div>
        {c.revenuePrinted || c.revenue ? <div className="col-span-2 text-fg-muted">Revenue: {c.revenuePrinted ?? Number(c.revenue).toLocaleString()} <Attr e={e} path="company.revenue" /></div> : null}
      </div>
    </Card>
  );
}

export function ContactCard({ s, e }: { s: SubmissionRecord; e: Enrichment }) {
  const p = (e.person ?? {}) as Record<string, string | undefined>;
  const em = (e.email ?? {}) as Record<string, unknown>;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">{displayName(s).slice(0, 2).toUpperCase()}</div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-fg">{p.name ?? displayName(s)}</div>
          <div className="truncate text-[12.5px] text-fg-subtle">{[p.title, p.seniority].filter(Boolean).join(" · ") || "Title unknown"}</div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-[12.5px]">
        <div className="flex flex-wrap items-center gap-1.5 text-fg-muted"><Mail size={13} />{String(em.address ?? "No email")}
          {em.address ? (em.valid ? <Badge tone="green">Valid</Badge> : <Badge tone="red">Invalid</Badge>) : null}
          {em.disposable ? <Badge tone="red">Disposable</Badge> : null}{em.freeProvider ? <Badge>Free provider</Badge> : null}{em.role ? <Badge>Role account</Badge> : null}
        </div>
        {p.linkedin && <div className="flex items-center gap-1.5"><Link2 size={13} className="text-fg-muted" /><a href={p.linkedin} target="_blank" rel="noreferrer" className="text-accent hover:underline">LinkedIn profile</a></div>}
      </div>
    </Card>
  );
}

function flatten(obj: unknown, prefix = ""): [string, unknown][] {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return [[prefix, obj]];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? flatten(v, prefix ? `${prefix}.${k}` : k) : [[prefix ? `${prefix}.${k}` : k, v] as [string, unknown]]));
}

const OUTCOME: Record<string, Tone> = { success: "green", cache_hit: "blue", error: "red", timeout: "red", skipped: "gray", no_data: "gray", pending: "amber" };

export function RecordView({ s, formName, afterDelete }: { s: SubmissionRecord; formName: string; afterDelete: string }) {
  const e = s.enrichment as Enrichment;
  const geo = (e.geo ?? {}) as Record<string, string | undefined>;
  const ua = (e.userAgent ?? {}) as Record<string, string | boolean | undefined>;
  const ai = (e.ai ?? {}) as Record<string, string | number | undefined>;
  const research = (e.research ?? {}) as { summary?: string; buyingSignals?: string[]; sources?: string[]; deepResearch?: { status?: string; mode?: string; estimatedCredits?: number } };
  const fields = flatten({ company: e.company, person: e.person, email: e.email, geo: e.geo, userAgent: e.userAgent, ai: e.ai, research: { summary: research.summary, buyingSignals: research.buyingSignals } }).filter(([k, v]) => v !== undefined && !k.endsWith("raw") && !k.includes("mxHosts") && !k.includes("snippets"));
  const routing = s.routing as { steps?: { ruleId: string; name: string; matched: boolean; details: string[] }[]; owner?: string | null; evaluatedAt?: string };
  const deliveries = listDeliveries(s.workspaceId, { formId: s.formId, limit: 200 }).filter((d) => d.submission_id === s.id);

  const answers = (
    <div className="space-y-4">
      <DL items={Object.entries(s.data).filter(([k]) => k !== "_subject").map(([k, v]) => [<span key={k} className="font-mono text-[12px]">{k}<span className="ml-1.5 text-[10.5px] uppercase text-fg-subtle">{s.fieldTypes[k]}</span></span>, <span key={`${k}v`} className="whitespace-pre-wrap">{fmtValue(v)}</span>])} />
      {s.files.length > 0 && (
        <div><p className="mb-2 text-[12px] font-medium text-fg-subtle">Files</p>
          <ul className="space-y-1">{s.files.map((f, i) => <li key={i}><a href={`/api/app/submissions/${s.id}/files/${i}`} className="inline-flex items-center gap-1.5 text-[12.5px] text-accent hover:underline"><Paperclip size={13} />{f.name} <span className="text-fg-subtle">({Math.round(f.size / 1024)} KB)</span></a></li>)}</ul>
        </div>
      )}
      <div className="rounded-md border border-line bg-subtle p-3">
        <p className="text-[12px] font-medium text-fg">Spam analysis · score {s.spamScore}/100 {s.isSpam ? <Badge tone="red" className="ml-1">Spam</Badge> : <Badge tone="green" className="ml-1">Clean</Badge>}</p>
        {s.spamReasons.length ? <ul className="mt-1.5 list-disc pl-4 text-[12px] text-fg-muted">{s.spamReasons.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="mt-1 text-[12px] text-fg-subtle">No spam signals.</p>}
      </div>
    </div>
  );

  const enrichment = (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2"><CompanyCard e={e} /><ContactCard s={s} e={e} /></div>
      {(ai.summary || research.summary) && (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-fg"><Sparkles size={14} className="text-accent" />Insights</div>
          {ai.summary && <p className="mt-2 text-[12.5px] text-fg-muted">{String(ai.summary)} <Attr e={e} path="ai.summary" /></p>}
          {ai.intent && <p className="mt-1.5 text-[12.5px] text-fg-muted">Intent: <Badge tone="indigo">{String(ai.intent).replace(/_/g, " ")}</Badge>{ai.icpReason ? ` — ${ai.icpReason}` : ""}</p>}
          {research.summary && <p className="mt-2 text-[12.5px] text-fg-muted">Research: {research.summary} <Attr e={e} path="research.summary" /></p>}
          {research.buyingSignals?.length ? <ul className="mt-1.5 list-disc pl-4 text-[12.5px] text-fg-muted">{research.buyingSignals.map((b) => <li key={b}>{b}</li>)}</ul> : null}
          {research.deepResearch && <p className="mt-2 text-[12px] text-fg-subtle">DeepResearch ({research.deepResearch.mode}): {research.deepResearch.status}{research.deepResearch.estimatedCredits ? ` · ~${research.deepResearch.estimatedCredits} credits` : ""}</p>}
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4"><p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-fg-subtle"><Globe2 size={13} />Location</p><DL items={[["IP", geo.ip], ["Country", geo.countryName ?? geo.label], ["City", geo.city], ["Timezone", geo.timezone]]} /></Card>
        <Card className="p-4"><p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-fg-subtle"><Monitor size={13} />Device</p><DL items={[["Browser", [ua.browser, ua.browserVersion].filter(Boolean).join(" ")], ["OS", ua.os as string], ["Device", ua.device as string], ["Bot", ua.isBot ? "Yes" : "No"]]} /></Card>
      </div>
      <div>
        <p className="mb-2 text-[12px] font-medium text-fg-subtle">Provider waterfall</p>
        <div className="flex flex-wrap gap-1.5">{Object.entries(e.providers ?? {}).map(([k, v]) => <Badge key={k} tone={OUTCOME[v?.status ?? ""] ?? "gray"}>{SOURCE_LABEL[k] ?? k}: {v?.status}{v?.ms ? ` · ${v.ms}ms` : ""}</Badge>)}</div>
        {Object.entries(e.providers ?? {}).filter(([, v]) => v?.message && v.status !== "success").map(([k, v]) => <p key={k} className="mt-1 text-[11.5px] text-fg-subtle">{SOURCE_LABEL[k] ?? k}: {v?.message}</p>)}
      </div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-[12.5px]">
          <thead className="bg-subtle text-left text-[11px] uppercase tracking-wide text-fg-subtle"><tr><th className="px-3 py-1.5 font-medium">Field</th><th className="px-3 py-1.5 font-medium">Value</th><th className="px-3 py-1.5 font-medium">Source</th></tr></thead>
          <tbody>{fields.map(([k, v]) => <tr key={k} className="border-t border-line"><td className="px-3 py-1.5 font-mono text-[11.5px] text-fg-muted">{k}</td><td className="max-w-[260px] truncate px-3 py-1.5 text-fg" title={fmtValue(v)}>{fmtValue(v)}</td><td className="px-3 py-1.5"><SourceBadge source={e.attribution?.[k]} /></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );

  const routingTab = (
    <div>
      {!routing.steps ? <p className="text-[12.5px] text-fg-subtle">Not routed yet{s.isSpam ? " (spam is never routed)" : ""}.</p> : (
        <ol className="relative space-y-3 border-l border-line pl-5">
          {routing.steps.length === 0 && <li className="text-[12.5px] text-fg-subtle">No active routing rules.</li>}
          {routing.steps.map((st) => (
            <li key={st.ruleId} className="relative">
              <span className="absolute -left-[27px] top-0.5 bg-panel">{st.matched ? <CheckCircle2 size={14} className="text-emerald-600" /> : <XCircle size={14} className="text-fg-subtle" />}</span>
              <p className="text-[13px] font-medium text-fg">{st.name} {st.matched && <Badge tone="green">Matched</Badge>}</p>
              <ul className="mt-1 space-y-0.5">{st.details.map((d, i) => <li key={i} className="font-mono text-[11.5px] text-fg-subtle">{d}</li>)}</ul>
            </li>
          ))}
          <li className="relative"><span className="absolute -left-[27px] top-0.5 bg-panel"><CircleDashed size={14} className="text-accent" /></span><p className="text-[13px] text-fg">Decision: owner <b>{routing.owner ?? "unassigned"}</b>{s.tags.length ? <> · tags {s.tags.map((t) => <Badge key={t} className="ml-1">{t}</Badge>)}</> : null}</p><p className="text-[11.5px] text-fg-subtle">{fmtDate(routing.evaluatedAt)}</p></li>
        </ol>
      )}
    </div>
  );

  const activity = (
    <div className="space-y-4">
      <ol className="space-y-2">{[...s.activity].reverse().map((a, i) => <li key={i} className="flex gap-3 text-[12.5px]"><span className="w-20 shrink-0 text-fg-subtle">{timeAgo(a.at)}</span><Badge>{a.type}</Badge><span className="text-fg-muted">{a.message}</span></li>)}</ol>
      <div><p className="mb-2 text-[12px] font-medium text-fg-subtle">Webhook deliveries</p>
        {deliveries.length ? <ul className="space-y-1">{deliveries.map((d) => <li key={d.id} className="flex flex-wrap items-center gap-2 text-[12.5px]"><Badge tone={d.status === "success" ? "green" : d.status === "failed" ? "red" : "amber"}>{d.status}</Badge><span className="font-mono text-[11.5px] text-fg-muted">{d.event}</span><span className="text-fg-subtle">HTTP {d.response_status ?? "—"} · attempt {d.attempts} · {timeAgo(d.created_at)}</span></li>)}</ul> : <p className="text-[12.5px] text-fg-subtle">No webhook deliveries for this submission.</p>}
      </div>
    </div>
  );

  const raw = <CodeBlock lang="json" code={JSON.stringify({ id: s.id, form_id: s.formId, data: s.data, enrichment: s.enrichment, routing: s.routing, spam: { score: s.spamScore, reasons: s.spamReasons }, meta: { ...s.meta, ip: s.meta.ip }, created_at: s.createdAt }, null, 2)} />;

  return (
    <div>
      <div className="flex flex-wrap items-start gap-4 border-b border-line p-4">
        <FitRing score={s.fitScore} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-semibold text-fg">{displayName(s)}</h2>
          <p className="truncate text-[12.5px] text-fg-subtle">{formName} · {fmtDate(s.createdAt)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={s.status === "new" ? "blue" : s.status === "archived" ? "gray" : "green"}>{s.status}</Badge>
            {s.isSpam && <Badge tone="red">Spam {s.spamScore}</Badge>}
            <Badge tone="indigo">Owner: {s.owner ?? "unassigned"}</Badge>
            {s.tags.map((t) => <Badge key={t}>{t}</Badge>)}
            <Badge tone={s.enrichmentStatus === "complete" ? "green" : "amber"}>Enrichment {s.enrichmentStatus}</Badge>
          </div>
          <div className="mt-3"><RecordActions id={s.id} isSpam={s.isSpam} owner={s.owner} afterDelete={afterDelete} /></div>
        </div>
      </div>
      <RecordTabs tabs={[
        { id: "answers", label: "Answers", count: Object.keys(s.data).length, content: answers },
        { id: "enrichment", label: "Enrichment", count: fields.length, content: enrichment },
        { id: "routing", label: "Routing", content: routingTab },
        { id: "activity", label: "Activity", count: s.activity.length + deliveries.length, content: activity },
        { id: "raw", label: "Raw JSON", content: raw },
      ]} />
    </div>
  );
}
