/**
 * Microsoft Outlook Calendar + Mail via OAuth2 (MSAL) + Microsoft Graph.
 */
import * as msal from "@azure/msal-node";
import type { CalendarClient, CreateEventInput, CreatedEvent, FetchLike, OAuthAppConfig, OAuthTokens, SendMailInput } from "./types";
import { slotsFromBusy } from "./slots";

const SCOPES = ["Calendars.ReadWrite", "Mail.Send", "User.Read", "offline_access", "openid", "profile", "email"];

function authority(tenant = "common") {
  return `https://login.microsoftonline.com/${tenant}`;
}

export function microsoftAuthUrl(cfg: OAuthAppConfig, state: string): string {
  const u = new URL(`${authority(cfg.tenant)}/oauth2/v2.0/authorize`);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_mode", "query");
  u.searchParams.set("scope", SCOPES.join(" "));
  u.searchParams.set("state", state);
  return u.toString();
}

function cca(cfg: OAuthAppConfig) {
  return new msal.ConfidentialClientApplication({
    auth: {
      clientId: cfg.clientId,
      authority: authority(cfg.tenant),
      clientSecret: cfg.clientSecret,
    },
  });
}

export async function exchangeMicrosoftCode(cfg: OAuthAppConfig, code: string, fetchImpl: FetchLike = fetch): Promise<OAuthTokens & { email?: string }> {
  try {
    const app = cca(cfg);
    const result = await app.acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri: cfg.redirectUri,
    });
    return {
      accessToken: result.accessToken,
      refreshToken: (result as { refreshToken?: string }).refreshToken,
      expiresAt: result.expiresOn ? result.expiresOn.toISOString() : undefined,
      scope: result.scopes,
      email: result.account?.username,
    };
  } catch {
    const res = await fetchImpl(`${authority(cfg.tenant)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId, client_secret: cfg.clientSecret, code,
        redirect_uri: cfg.redirectUri, grant_type: "authorization_code", scope: SCOPES.join(" "),
      }),
    });
    const j = await res.json() as Record<string, unknown>;
    if (!res.ok) throw new Error(String(j.error_description ?? j.error ?? "Microsoft token exchange failed"));
    return {
      accessToken: String(j.access_token),
      refreshToken: j.refresh_token ? String(j.refresh_token) : undefined,
      expiresAt: typeof j.expires_in === "number" ? new Date(Date.now() + j.expires_in * 1000).toISOString() : undefined,
      scope: typeof j.scope === "string" ? j.scope.split(" ") : undefined,
    };
  }
}

export async function refreshMicrosoftToken(cfg: OAuthAppConfig, refreshToken: string, fetchImpl: FetchLike = fetch): Promise<OAuthTokens> {
  const res = await fetchImpl(`${authority(cfg.tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refreshToken,
      grant_type: "refresh_token", scope: SCOPES.join(" "),
    }),
  });
  const j = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error(String(j.error_description ?? j.error ?? "Microsoft refresh failed"));
  return {
    accessToken: String(j.access_token),
    refreshToken: j.refresh_token ? String(j.refresh_token) : refreshToken,
    expiresAt: typeof j.expires_in === "number" ? new Date(Date.now() + j.expires_in * 1000).toISOString() : undefined,
  };
}

export function createMicrosoftClient(accessToken: string, fetchImpl: FetchLike = fetch): CalendarClient {
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  return {
    provider: "microsoft",
    async freeBusy({ email, timeMin, timeMax, durationMin = 30 }) {
      const res = await fetchImpl("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
        method: "POST",
        headers,
        body: JSON.stringify({
          schedules: [email],
          startTime: { dateTime: timeMin.replace(/\.\d{3}Z$/, ""), timeZone: "UTC" },
          endTime: { dateTime: timeMax.replace(/\.\d{3}Z$/, ""), timeZone: "UTC" },
          availabilityViewInterval: 30,
        }),
      });
      const j = await res.json() as {
        value?: { scheduleItems?: { start?: { dateTime?: string }; end?: { dateTime?: string }; status?: string }[] }[];
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(j.error?.message ?? "Graph getSchedule failed");
      const items = j.value?.[0]?.scheduleItems ?? [];
      const busy = items
        .filter((i) => i.status && i.status !== "free")
        .map((i) => ({
          start: i.start?.dateTime ? new Date(i.start.dateTime + "Z").toISOString() : timeMin,
          end: i.end?.dateTime ? new Date(i.end.dateTime + "Z").toISOString() : timeMax,
        }));
      return slotsFromBusy(busy, timeMin, timeMax, durationMin);
    },
    async createEvent(input: CreateEventInput): Promise<CreatedEvent> {
      const body = {
        subject: input.title,
        body: { contentType: "HTML", content: input.description ?? "" },
        start: { dateTime: input.start.replace(/\.\d{3}Z$/, ""), timeZone: input.timezone ?? "UTC" },
        end: { dateTime: input.end.replace(/\.\d{3}Z$/, ""), timeZone: input.timezone ?? "UTC" },
        attendees: [{ emailAddress: { address: input.attendeeEmail, name: input.attendeeName }, type: "required" }],
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
      };
      const res = await fetchImpl("https://graph.microsoft.com/v1.0/me/events", { method: "POST", headers, body: JSON.stringify(body) });
      const j = await res.json() as {
        id?: string; webLink?: string; onlineMeeting?: { joinUrl?: string }; error?: { message?: string };
      };
      if (!res.ok) throw new Error(j.error?.message ?? "Graph create event failed");
      return { id: j.id ?? "", meetUrl: j.onlineMeeting?.joinUrl ?? null, htmlLink: j.webLink ?? null, provider: "microsoft" };
    },
    async sendMail(input: SendMailInput) {
      const res = await fetchImpl("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: {
            subject: input.subject,
            body: { contentType: input.html ? "HTML" : "Text", content: input.html ?? input.text },
            toRecipients: [{ emailAddress: { address: input.to } }],
          },
          saveToSentItems: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(j.error?.message ?? "Graph sendMail failed");
      }
      return { id: "sent" };
    },
  };
}

export { SCOPES as MICROSOFT_SCOPES };
