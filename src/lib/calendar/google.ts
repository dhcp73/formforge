/**
 * Google Calendar + Gmail via OAuth2.
 * Uses googleapis when available for token exchange / Gmail send; Calendar freeBusy + events via REST
 * (also exercised through the same injectable fetch so tests never hit the network).
 */
import { google } from "googleapis";
import type { CalendarClient, CreateEventInput, CreatedEvent, FetchLike, OAuthAppConfig, OAuthTokens, SendMailInput } from "./types";
import { slotsFromBusy } from "./slots";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
  "profile",
];

export function googleAuthUrl(cfg: OAuthAppConfig, state: string): string {
  const u = new URL(AUTH);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("scope", SCOPES.join(" "));
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeGoogleCode(cfg: OAuthAppConfig, code: string, fetchImpl: FetchLike = fetch): Promise<OAuthTokens & { email?: string }> {
  // Prefer googleapis OAuth2 client
  try {
    const oauth2 = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);
    let email: string | undefined;
    try {
      const oauth2api = google.oauth2({ version: "v2", auth: oauth2 });
      const me = await oauth2api.userinfo.get();
      email = me.data.email ?? undefined;
    } catch { /* optional */ }
    return {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
      scope: tokens.scope?.split(" "),
      idToken: tokens.id_token ?? undefined,
      email,
    };
  } catch {
    // Fallback REST (also used when googleapis path is mocked)
    const res = await fetchImpl(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: cfg.clientId, client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri, grant_type: "authorization_code",
      }),
    });
    const j = await res.json() as Record<string, unknown>;
    if (!res.ok) throw new Error(String(j.error_description ?? j.error ?? "Google token exchange failed"));
    return {
      accessToken: String(j.access_token),
      refreshToken: j.refresh_token ? String(j.refresh_token) : undefined,
      expiresAt: typeof j.expires_in === "number" ? new Date(Date.now() + j.expires_in * 1000).toISOString() : undefined,
      scope: typeof j.scope === "string" ? j.scope.split(" ") : undefined,
      idToken: j.id_token ? String(j.id_token) : undefined,
    };
  }
}

export async function refreshGoogleToken(cfg: OAuthAppConfig, refreshToken: string, fetchImpl: FetchLike = fetch): Promise<OAuthTokens> {
  const oauth2 = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
  oauth2.setCredentials({ refresh_token: refreshToken });
  try {
    const { credentials } = await oauth2.refreshAccessToken();
    return {
      accessToken: credentials.access_token!,
      refreshToken: credentials.refresh_token ?? refreshToken,
      expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : undefined,
      scope: credentials.scope?.split(" "),
    };
  } catch {
    const res = await fetchImpl(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token",
      }),
    });
    const j = await res.json() as Record<string, unknown>;
    if (!res.ok) throw new Error(String(j.error_description ?? j.error ?? "Google refresh failed"));
    return {
      accessToken: String(j.access_token),
      refreshToken,
      expiresAt: typeof j.expires_in === "number" ? new Date(Date.now() + j.expires_in * 1000).toISOString() : undefined,
    };
  }
}

export function createGoogleClient(accessToken: string, fetchImpl: FetchLike = fetch): CalendarClient {
  return {
    provider: "google",
    async freeBusy({ email, timeMin, timeMax, durationMin = 30 }) {
      const res = await fetchImpl("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ timeMin, timeMax, items: [{ id: email }] }),
      });
      const j = await res.json() as { calendars?: Record<string, { busy?: { start: string; end: string }[] }>; error?: { message?: string } };
      if (!res.ok) throw new Error(j.error?.message ?? "Google freeBusy failed");
      const busy = j.calendars?.[email]?.busy ?? j.calendars?.[Object.keys(j.calendars ?? {})[0]]?.busy ?? [];
      return slotsFromBusy(busy, timeMin, timeMax, durationMin);
    },
    async createEvent(input: CreateEventInput): Promise<CreatedEvent> {
      const body = {
        summary: input.title,
        description: input.description ?? "",
        start: { dateTime: input.start, timeZone: input.timezone ?? "UTC" },
        end: { dateTime: input.end, timeZone: input.timezone ?? "UTC" },
        attendees: [{ email: input.attendeeEmail, displayName: input.attendeeName }],
        conferenceData: {
          createRequest: { requestId: `ff-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } },
        },
      };
      const res = await fetchImpl("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json() as { id?: string; hangoutLink?: string; htmlLink?: string; error?: { message?: string } };
      if (!res.ok) throw new Error(j.error?.message ?? "Google create event failed");
      return { id: j.id ?? "", meetUrl: j.hangoutLink ?? null, htmlLink: j.htmlLink ?? null, provider: "google" };
    },
    async sendMail(input: SendMailInput) {
      // Use Gmail API raw message
      const from = input.fromEmail ?? "me";
      const raw = [
        `To: ${input.to}`,
        `Subject: ${input.subject}`,
        "MIME-Version: 1.0",
        input.html ? 'Content-Type: text/html; charset="UTF-8"' : 'Content-Type: text/plain; charset="UTF-8"',
        "",
        input.html ?? input.text,
      ].join("\r\n");
      const encoded = Buffer.from(raw).toString("base64url");
      const res = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: encoded }),
      });
      const j = await res.json() as { id?: string; error?: { message?: string } };
      if (!res.ok) throw new Error(j.error?.message ?? "Gmail send failed");
      void from;
      return { id: j.id ?? "sent" };
    },
  };
}

export { SCOPES as GOOGLE_SCOPES };
export { slotsFromBusy } from "./slots";
