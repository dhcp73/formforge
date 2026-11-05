import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { workspace } from "./helpers";
import {
  createGoogleClient, createMicrosoftClient, slotsFromBusy,
  setCalendarFetch, resetCalendarFetch, upsertConnection, bookSlot, slotsForOwner, ownersWithAvailability,
} from "@/lib/calendar";
import { form, submit } from "./helpers";
import { getDb } from "@/lib/db";

describe("slotsFromBusy", () => {
  it("fills gaps between busy blocks on a 30-min grid", () => {
    // 10:00–11:00 busy UTC on a fixed day
    const day = "2030-06-03T";
    const busy = [{ start: `${day}10:00:00.000Z`, end: `${day}11:00:00.000Z` }];
    const slots = slotsFromBusy(busy, `${day}08:00:00.000Z`, `${day}16:00:00.000Z`, 30);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => new Date(s.end).getTime() - new Date(s.start).getTime() === 30 * 60_000)).toBe(true);
    // none overlap the busy hour
    for (const s of slots) {
      const a = new Date(s.start).getTime(), b = new Date(s.end).getTime();
      expect(b <= Date.parse(`${day}10:00:00.000Z`) || a >= Date.parse(`${day}11:00:00.000Z`)).toBe(true);
    }
  });
});

describe("Google + Microsoft clients (mocked fetch)", () => {
  afterEach(() => resetCalendarFetch());

  it("google freeBusy + createEvent + sendMail", async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.includes("freeBusy")) {
        return new Response(JSON.stringify({ calendars: { "ava@x.io": { busy: [] } } }), { status: 200 });
      }
      if (url.includes("/events")) {
        return new Response(JSON.stringify({ id: "evt_1", hangoutLink: "https://meet.google.com/abc", htmlLink: "https://calendar.google.com/e/1" }), { status: 200 });
      }
      if (url.includes("gmail")) {
        return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    };
    const client = createGoogleClient("tok", fetchMock);
    const slots = await client.freeBusy({ email: "ava@x.io", timeMin: new Date().toISOString(), timeMax: new Date(Date.now() + 864e5).toISOString() });
    expect(Array.isArray(slots)).toBe(true);
    const ev = await client.createEvent({
      title: "Demo", start: new Date().toISOString(), end: new Date(Date.now() + 1800e3).toISOString(),
      attendeeEmail: "lead@acme.test", organizerEmail: "ava@x.io",
    });
    expect(ev.meetUrl).toContain("meet.google.com");
    const mail = await client.sendMail({ to: "lead@acme.test", subject: "Hi", text: "Hello" });
    expect(mail.id).toBe("msg_1");
    expect(calls.some((c) => c.url.includes("freeBusy"))).toBe(true);
    expect(calls.some((c) => c.url.includes("gmail"))).toBe(true);
  });

  it("microsoft getSchedule + createEvent + sendMail", async () => {
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("getSchedule")) {
        return new Response(JSON.stringify({ value: [{ scheduleItems: [] }] }), { status: 200 });
      }
      if (url.includes("/events")) {
        return new Response(JSON.stringify({ id: "evt_ms", onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/x" }, webLink: "https://outlook.office.com/e/1" }), { status: 200 });
      }
      if (url.includes("sendMail")) return new Response(null, { status: 202 });
      return new Response("{}", { status: 404 });
    };
    const client = createMicrosoftClient("tok", fetchMock);
    const slots = await client.freeBusy({ email: "ava@x.io", timeMin: new Date().toISOString(), timeMax: new Date(Date.now() + 864e5).toISOString() });
    expect(Array.isArray(slots)).toBe(true);
    const ev = await client.createEvent({
      title: "Demo", start: new Date().toISOString(), end: new Date(Date.now() + 1800e3).toISOString(),
      attendeeEmail: "lead@acme.test", organizerEmail: "ava@x.io",
    });
    expect(ev.meetUrl).toContain("teams.microsoft.com");
    await expect(client.sendMail({ to: "lead@acme.test", subject: "Hi", text: "Hello" })).resolves.toEqual({ id: "sent" });
  });
});

describe("booking orchestration", () => {
  const { ws, userId } = workspace("Cal");
  afterEach(() => resetCalendarFetch());

  it("books a slot when the owner is connected", async () => {
    upsertConnection({
      workspaceId: ws, userId, provider: "google", accountEmail: "ava@acme.test",
      tokens: { accessToken: "access", refreshToken: "refresh", expiresAt: new Date(Date.now() + 3600e3).toISOString() },
    });
    setCalendarFetch(async (input) => {
      const url = String(input);
      if (url.includes("freeBusy")) return new Response(JSON.stringify({ calendars: { "ava@acme.test": { busy: [] } } }), { status: 200 });
      if (url.includes("/events")) return new Response(JSON.stringify({ id: "e1", hangoutLink: "https://meet.google.com/xyz" }), { status: 200 });
      if (url.includes("gmail")) return new Response(JSON.stringify({ id: "m1" }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    const f = form(ws);
    const s = await submit(f.id, { email: "lead@buyer.test", name: "Ada" });
    getDb().prepare("UPDATE submissions SET owner = ? WHERE id = ?").run("ava@acme.test", s.json.id);
    const start = new Date(Date.now() + 3600e3).toISOString();
    const end = new Date(Date.now() + 5400e3).toISOString();
    const booked = await bookSlot({ workspaceId: ws, submissionId: s.json.id as string, start, end });
    expect(booked.meetUrl).toContain("meet.google.com");
    expect(booked.provider).toBe("google");
    const { slots, connected } = await slotsForOwner(ws, "ava@acme.test");
    expect(connected).toBe(true);
    expect(Array.isArray(slots)).toBe(true);
  });

  it("ownersWithAvailability skips connected reps with no slots", async () => {
    upsertConnection({
      workspaceId: ws, userId, provider: "google", accountEmail: "busy@acme.test",
      tokens: { accessToken: "access", expiresAt: new Date(Date.now() + 3600e3).toISOString() },
    });
    setCalendarFetch(async (input) => {
      const url = String(input);
      if (url.includes("freeBusy")) {
        // Fully busy for a week
        const timeMin = new Date().toISOString();
        const timeMax = new Date(Date.now() + 7 * 864e5).toISOString();
        return new Response(JSON.stringify({ calendars: { "busy@acme.test": { busy: [{ start: timeMin, end: timeMax }] } } }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    const { available, skipped } = await ownersWithAvailability(ws, ["busy@acme.test", "free-unconnected@acme.test"]);
    expect(skipped).toContain("busy@acme.test");
    expect(available).toContain("free-unconnected@acme.test");
  });
});
