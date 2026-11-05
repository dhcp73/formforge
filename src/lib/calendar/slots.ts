import type { CalendarSlot } from "./types";

/** Turn busy blocks into bookable free slots (30-min grid, 09–17 UTC). */
export function slotsFromBusy(busy: { start: string; end: string }[], timeMin: string, timeMax: string, durationMin: number): CalendarSlot[] {
  const startMs = new Date(timeMin).getTime();
  const endMs = new Date(timeMax).getTime();
  const dur = durationMin * 60_000;
  const blocks = busy.map((b) => ({ s: new Date(b.start).getTime(), e: new Date(b.end).getTime() })).sort((a, b) => a.s - b.s);
  const free: CalendarSlot[] = [];
  let cursor = Math.ceil(startMs / (30 * 60_000)) * (30 * 60_000);
  const pushGap = (from: number, to: number) => {
    for (let t = from; t + dur <= to; t += 30 * 60_000) {
      const hour = new Date(t).getUTCHours();
      if (hour < 9 || hour >= 17) continue;
      free.push({ start: new Date(t).toISOString(), end: new Date(t + dur).toISOString() });
      if (free.length >= 24) return;
    }
  };
  for (const b of blocks) {
    if (b.s > cursor) pushGap(cursor, Math.min(b.s, endMs));
    cursor = Math.max(cursor, b.e);
    if (free.length >= 24) break;
  }
  if (cursor < endMs && free.length < 24) pushGap(cursor, endMs);
  return free;
}
