"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";

const tip = { contentStyle: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, color: "var(--fg)" }, labelStyle: { color: "var(--fg-subtle)" } };

export function SubmissionsChart({ data }: { data: { date: string; submissions: number; spam: number }[] }) {
  const d = data.map((x) => ({ ...x, label: new Date(x.date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) }));
  return (
    <div className="h-64 w-full" role="img" aria-label={`Submissions over the last ${data.length} days`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={d} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f46e5" stopOpacity={0.28} /><stop offset="100%" stopColor="#4f46e5" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} tickLine={false} axisLine={false} />
          <Tooltip {...tip} />
          <Area type="monotone" dataKey="submissions" name="Submissions" stroke="#4f46e5" strokeWidth={2} fill="url(#g1)" />
          <Area type="monotone" dataKey="spam" name="Spam" stroke="#f59e0b" strokeWidth={1.5} fill="transparent" strokeDasharray="4 3" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#64748b", "#14b8a6"];
export function HBarChart({ data, valueLabel = "Count", unit = "" }: { data: { name: string; value: number }[]; valueLabel?: string; unit?: string }) {
  return (
    <div className="w-full" style={{ height: Math.max(120, data.length * 34 + 20) }} role="img" aria-label={`${valueLabel} chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
          <XAxis type="number" hide domain={[0, unit === "%" ? 100 : "auto"]} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fill: "var(--fg-muted)" }} tickLine={false} axisLine={false} />
          <Tooltip {...tip} formatter={(v) => [`${v}${unit}`, valueLabel]} cursor={{ fill: "var(--muted)" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16} label={{ position: "right", fontSize: 11, fill: "var(--fg-subtle)", formatter: (v: unknown) => `${v}${unit}` }}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
