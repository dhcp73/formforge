import { getDb, now } from "../db";
import { newId } from "../ids";
import { getSubmissionById } from "../submissions";
import { sendEmail } from "../email";
import { publicUrl } from "../enrich/pipeline";
import { createGoogleClient, refreshGoogleToken } from "./google";
import { createMicrosoftClient, refreshMicrosoftToken } from "./microsoft";
import { getConnectionByEmail, resolveAppConfig, upsertConnection, type OAuthConnection } from "./store";
import type { CalendarClient, CalendarProvider, CalendarSlot, FetchLike } from "./types";

/** Test seam: override fetch used by provider clients. */
let fetchImpl: FetchLike = fetch;
export function setCalendarFetch(f: FetchLike) { fetchImpl = f; }
export function resetCalendarFetch() { fetchImpl = fetch; }

async function withFreshTokens(conn: OAuthConnection): Promise<{ client: CalendarClient; conn: OAuthConnection }> {
  const base = publicUrl();
  const cfg = resolveAppConfig(conn.workspaceId, conn.provider, base);
  let tokens = conn.tokens;
  const expired = conn.expiresAt && new Date(conn.expiresAt).getTime() < Date.now() + 60_000;
  if (expired && tokens.refreshToken && cfg) {
    tokens = conn.provider === "google"
      ? await refreshGoogleToken(cfg, tokens.refreshToken, fetchImpl)
      : await refreshMicrosoftToken(cfg, tokens.refreshToken, fetchImpl);
    conn = upsertConnection({
      workspaceId: conn.workspaceId, userId: conn.userId, provider: conn.provider,
      accountEmail: conn.accountEmail, tokens: { ...tokens, refreshToken: tokens.refreshToken ?? conn.tokens.refreshToken },
      scopes: conn.scopes, meta: conn.meta,
    });
  }
  const client = conn.provider === "google"
    ? createGoogleClient(conn.tokens.accessToken, fetchImpl)
    : createMicrosoftClient(conn.tokens.accessToken, fetchImpl);
  return { client, conn };
}

export async function slotsForOwner(ws: string, ownerEmail: string, opts: { days?: number; durationMin?: number } = {}): Promise<{
  slots: CalendarSlot[];
  provider: CalendarProvider | null;
  connected: boolean;
  owner: string;
}> {
  const conn = getConnectionByEmail(ws, ownerEmail);
  if (!conn) return { slots: [], provider: null, connected: false, owner: ownerEmail };
  try {
    const { client } = await withFreshTokens(conn);
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + (opts.days ?? 7) * 86400_000).toISOString();
    const slots = await client.freeBusy({ email: conn.accountEmail || ownerEmail, timeMin, timeMax, durationMin: opts.durationMin ?? 30 });
    return { slots, provider: conn.provider, connected: true, owner: ownerEmail };
  } catch (e) {
    console.error("[calendar] freeBusy", e);
    return { slots: [], provider: conn.provider, connected: true, owner: ownerEmail };
  }
}

/** Filter owners to those who have at least one free slot (or are not connected — kept as fallback). */
export async function ownersWithAvailability(ws: string, owners: string[]): Promise<{ available: string[]; skipped: string[] }> {
  const available: string[] = [];
  const skipped: string[] = [];
  for (const o of owners) {
    const conn = getConnectionByEmail(ws, o);
    if (!conn) { available.push(o); continue; } // not connected → keep (external booking link fallback)
    const { slots } = await slotsForOwner(ws, o, { days: 5, durationMin: 30 });
    if (slots.length) available.push(o);
    else skipped.push(o);
  }
  return { available: available.length ? available : owners, skipped };
}

export async function bookSlot(opts: {
  workspaceId: string;
  submissionId: string;
  start: string;
  end: string;
}): Promise<{ bookingId: string; meetUrl: string | null; eventId: string; provider: CalendarProvider; emailed: boolean }> {
  const s = getSubmissionById(opts.submissionId);
  if (!s || s.workspaceId !== opts.workspaceId) throw new Error("Submission not found");
  const owner = s.owner;
  if (!owner) throw new Error("No owner assigned yet");
  const conn = getConnectionByEmail(opts.workspaceId, owner);
  if (!conn) throw new Error("Owner has no connected calendar");

  const { client, conn: fresh } = await withFreshTokens(conn);
  const leadEmail = String((s.enrichment as { email?: { address?: string } })?.email?.address ?? s.data.email ?? "");
  const leadName = String(s.data.name ?? s.data.first_name ?? "");
  if (!leadEmail) throw new Error("Submission has no email to invite");

  const event = await client.createEvent({
    title: `FormForge meeting · ${leadName || leadEmail}`,
    description: `Booked from FormForge submission ${s.id}\n\n${JSON.stringify(s.data, null, 2).slice(0, 2000)}`,
    start: opts.start,
    end: opts.end,
    attendeeEmail: leadEmail,
    attendeeName: leadName || undefined,
    organizerEmail: fresh.accountEmail || owner,
  });

  let emailed = false;
  try {
    await client.sendMail({
      to: leadEmail,
      subject: `You're booked${leadName ? `, ${leadName.split(" ")[0]}` : ""}`,
      text: `Your meeting is confirmed for ${opts.start}.\n${event.meetUrl ? `Join: ${event.meetUrl}\n` : ""}${event.htmlLink ? `Calendar: ${event.htmlLink}\n` : ""}`,
      html: `<p>Your meeting is confirmed for <b>${opts.start}</b>.</p>${event.meetUrl ? `<p><a href="${event.meetUrl}">Join meeting</a></p>` : ""}`,
      fromEmail: fresh.accountEmail || owner,
    });
    emailed = true;
  } catch (e) {
    // Fallback to outbox
    await sendEmail({
      to: leadEmail, workspaceId: opts.workspaceId, kind: "booking",
      subject: `You're booked${leadName ? `, ${leadName.split(" ")[0]}` : ""}`,
      text: `Your meeting is confirmed for ${opts.start}.\n${event.meetUrl ? `Join: ${event.meetUrl}\n` : ""}`,
    });
  }

  const id = newId("book");
  getDb().prepare(
    `INSERT INTO bookings (id, workspace_id, submission_id, owner_email, provider, start_at, end_at, meet_url, event_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
  ).run(id, opts.workspaceId, s.id, owner, fresh.provider, opts.start, opts.end, event.meetUrl, event.id, now());

  return { bookingId: id, meetUrl: event.meetUrl, eventId: event.id, provider: fresh.provider, emailed };
}

/** Public helper used by the hosted form (no API key): looks up submission's workspace + owner. */
export async function publicSlotsForSubmission(submissionId: string) {
  const s = getSubmissionById(submissionId);
  if (!s) throw new Error("Submission not found");
  if (!s.owner) return { slots: [] as CalendarSlot[], owner: null, connected: false, booking_url: (s.routing as { bookingUrl?: string | null })?.bookingUrl ?? null };
  const result = await slotsForOwner(s.workspaceId, s.owner);
  return { ...result, booking_url: (s.routing as { bookingUrl?: string | null })?.bookingUrl ?? null, submissionId };
}

export async function publicBookSubmission(submissionId: string, start: string, end: string) {
  const s = getSubmissionById(submissionId);
  if (!s) throw new Error("Submission not found");
  return bookSlot({ workspaceId: s.workspaceId, submissionId, start, end });
}
