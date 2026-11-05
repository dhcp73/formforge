export type CalendarProvider = "google" | "microsoft";

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string; // ISO
  scope?: string[];
  tokenType?: string;
  idToken?: string;
}

export interface CalendarSlot {
  start: string; // ISO
  end: string;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  start: string;
  end: string;
  attendeeEmail: string;
  attendeeName?: string;
  organizerEmail: string;
  timezone?: string;
}

export interface CreatedEvent {
  id: string;
  meetUrl: string | null;
  htmlLink: string | null;
  provider: CalendarProvider;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fromEmail?: string;
}

/** Injectable HTTP for tests. */
export type FetchLike = typeof fetch;

export interface CalendarClient {
  provider: CalendarProvider;
  freeBusy(opts: { email: string; timeMin: string; timeMax: string; durationMin?: number }): Promise<CalendarSlot[]>;
  createEvent(input: CreateEventInput): Promise<CreatedEvent>;
  sendMail(input: SendMailInput): Promise<{ id: string }>;
}

export interface OAuthAppConfig {
  clientId: string;
  clientSecret: string;
  tenant?: string; // microsoft
  redirectUri: string;
}
