import type { SubmissionRecord } from "./types";
export function timeAgo(iso: string, nowMs = Date.now()) {
  const s = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24); if (d < 60) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London" });
}
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" }) + " UK" : "—");
export function displayName(s: Pick<SubmissionRecord, "data" | "enrichment">) {
  const d = s.data;
  const pick = (...k: string[]) => { for (const x of k) if (typeof d[x] === "string" && d[x]) return d[x] as string; return null; };
  return pick("name", "full_name", "fullName", "first_name") ?? pick("email", "Email") ?? ((s.enrichment as { email?: { address?: string } }).email?.address ?? "Anonymous");
}
export const fmtValue = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
