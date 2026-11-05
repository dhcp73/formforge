import { Badge } from "@/components/ui/primitives";

const ROWS = [
  { name: "Priya Shah", email: "priya@monzo.com", company: "Monzo", size: "3,500", country: "GB", fit: 92, owner: "Ava (EMEA)", src: "Apollo" },
  { name: "Daniel Ortiz", email: "dan@initech.com", company: "Initech", size: "300", country: "US", fit: 78, owner: "Leo (Mid-market)", src: "Clay" },
  { name: "Mia Chen", email: "mia@canva.com", company: "Canva", size: "4,000", country: "AU", fit: 88, owner: "Ava (EMEA)", src: "Valyu" },
  { name: "Tom Becker", email: "tom@gmail.com", company: "—", size: "—", country: "DE", fit: 34, owner: "Nurture", src: "AI" },
  { name: "Sam Rivera", email: "sam@acme.io", company: "Acme Inc", size: "45", country: "GB", fit: 64, owner: "Leo (Mid-market)", src: "Offline" },
];

export function ProductMock() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-[0_30px_80px_-30px_rgb(79_70_229/0.35)]">
      <div className="flex items-center gap-2 border-b border-line bg-subtle px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 truncate text-[12px] text-fg-subtle">Leads · Demo requests · All enriched</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2 text-[12px]">
        <Badge tone="indigo">Fit ≥ 60</Badge><Badge>Country in GB, US</Badge><Badge>Spam: hidden</Badge>
        <span className="ml-auto hidden text-fg-subtle sm:inline">1,284 records</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[12.5px]">
          <thead className="bg-subtle text-[11.5px] uppercase tracking-wide text-fg-subtle">
            <tr>{["Name", "Company", "Size", "Country", "Fit", "Owner", "Source"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.email} className="border-t border-line">
                <td className="px-3 py-2"><div className="font-medium text-fg">{r.name}</div><div className="text-[11.5px] text-fg-subtle">{r.email}</div></td>
                <td className="px-3 py-2 text-fg">{r.company}</td>
                <td className="px-3 py-2 tabular-nums text-fg-muted">{r.size}</td>
                <td className="px-3 py-2 text-fg-muted">{r.country}</td>
                <td className="px-3 py-2"><Badge tone={r.fit >= 80 ? "green" : r.fit >= 60 ? "amber" : "gray"}>{r.fit}</Badge></td>
                <td className="px-3 py-2 text-fg-muted">{r.owner}</td>
                <td className="px-3 py-2"><Badge tone="violet">{r.src}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
