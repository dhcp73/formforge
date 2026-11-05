import dns from "node:dns/promises";
import net from "node:net";
import { createRequire } from "node:module";
import Bowser from "bowser";
import { FREE_EMAIL_PROVIDERS, OFFLINE_COMPANIES, ROLE_ACCOUNTS } from "./offline-dataset";
import type { Enricher } from "./types";

const require = createRequire(import.meta.url);
let disposable: Set<string> | null = null;
function disposableSet(): Set<string> {
  if (!disposable) {
    try { disposable = new Set<string>(require("disposable-email-domains") as string[]); }
    catch { disposable = new Set(["mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com", "yopmail.com"]); }
  }
  return disposable;
}

export const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const mxCache = new Map<string, { at: number; hosts: string[] | null }>();
export async function lookupMx(domain: string, timeoutMs = 2500): Promise<string[] | null> {
  if (process.env.FORMFORGE_DNS === "off") return null;
  const hit = mxCache.get(domain);
  if (hit && Date.now() - hit.at < 3600_000) return hit.hosts;
  const result = await Promise.race([
    dns.resolveMx(domain).then((r) => r.sort((a, b) => a.priority - b.priority).map((m) => m.exchange)).catch((e: NodeJS.ErrnoException) => (e.code === "ENOTFOUND" || e.code === "ENODATA" ? [] : null)),
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
  ]);
  mxCache.set(domain, { at: Date.now(), hosts: result });
  return result;
}

export function isDisposable(domain: string) { return disposableSet().has(domain.toLowerCase()); }

export function domainFromUrl(v: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    return h.includes(".") ? h : null;
  } catch { return null; }
}

export const emailEnricher: Enricher = {
  id: "email", label: "Email verification", stage: "inline", timeoutMs: 3000,
  isEnabled: (ctx) => !!ctx.email,
  async run(ctx) {
    const email = ctx.email!.trim().toLowerCase();
    const syntaxValid = EMAIL_RE.test(email);
    const [local, domain] = email.split("@");
    const mx = syntaxValid ? await lookupMx(domain) : [];
    const disposableHit = syntaxValid && isDisposable(domain);
    const valid = syntaxValid && !disposableHit && (mx === null || mx.length > 0);
    return {
      fields: {
        "email.address": email, "email.syntaxValid": syntaxValid, "email.mx": mx === null ? null : mx.length > 0,
        "email.mxHosts": mx ?? [], "email.disposable": disposableHit, "email.freeProvider": FREE_EMAIL_PROVIDERS.has(domain),
        "email.role": ROLE_ACCOUNTS.has(local), "email.valid": valid, "email.domain": domain,
      },
    };
  },
};

function isPrivateIp(ip: string) {
  if (ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  const m = ip.match(/^172\.(\d+)\./);
  return !!m && +m[1] >= 16 && +m[1] <= 31;
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
export const countryName = (code: string) => { try { return regionNames.of(code) ?? code; } catch { return code; } };

export const geoEnricher: Enricher = {
  id: "ipgeo", label: "IP geolocation (offline)", stage: "inline", timeoutMs: 1000,
  isEnabled: (ctx) => !!ctx.ip,
  async run(ctx) {
    const ip = ctx.ip!.replace(/^::ffff:/, "");
    if (!net.isIP(ip)) return null;
    if (isPrivateIp(ip)) return { fields: { "geo.ip": ip, "geo.private": true, "geo.label": "Private / local network" } };
    let geo: { country: string; region: string; city: string; timezone: string; ll: [number, number] } | null = null;
    try { geo = (require("geoip-lite") as { lookup: (ip: string) => typeof geo }).lookup(ip); } catch { geo = null; }
    if (!geo) return { fields: { "geo.ip": ip } };
    return {
      fields: {
        "geo.ip": ip, "geo.country": geo.country, "geo.countryName": countryName(geo.country), "geo.region": geo.region || null,
        "geo.city": geo.city || null, "geo.timezone": geo.timezone, "geo.lat": geo.ll?.[0], "geo.lon": geo.ll?.[1],
      },
    };
  },
};

export const userAgentEnricher: Enricher = {
  id: "useragent", label: "User-agent parsing", stage: "inline", timeoutMs: 500,
  isEnabled: (ctx) => !!ctx.userAgent,
  async run(ctx) {
    const ua = ctx.userAgent!;
    const p = Bowser.parse(ua);
    const isBot = /bot|crawl|spider|slurp|headless|curl|wget|python-requests|httpclient|axios|node-fetch/i.test(ua);
    return {
      fields: {
        "userAgent.browser": p.browser.name ?? null, "userAgent.browserVersion": p.browser.version ?? null,
        "userAgent.os": [p.os.name, p.os.versionName ?? p.os.version].filter(Boolean).join(" ") || null,
        "userAgent.device": p.platform.type ?? (isBot ? "bot" : null), "userAgent.isBot": isBot, "userAgent.raw": ua.slice(0, 300),
      },
    };
  },
};

/** Company domain from business email or website field + bundled offline dataset. */
export const companyEnricher: Enricher = {
  id: "offline", label: "Company domain + offline dataset", stage: "inline", timeoutMs: 200,
  isEnabled: (ctx) => !!ctx.domain,
  async run(ctx) {
    const domain = ctx.domain!;
    const fields: Record<string, unknown> = { "company.domain": domain, "company.website": `https://${domain}`, "company.logo": `https://www.google.com/s2/favicons?domain=${domain}&sz=64` };
    if (ctx.companyName) fields["company.name"] = ctx.companyName;
    const c = OFFLINE_COMPANIES[domain];
    if (c) Object.assign(fields, {
      "company.name": c.name, "company.industry": c.industry, "company.employees": c.employees, "company.country": c.country,
      "company.city": c.city, "company.linkedin": c.linkedin ?? null, "company.description": c.description,
    });
    else if (!ctx.companyName) fields["company.name"] = domain.split(".")[0].replace(/^./, (s) => s.toUpperCase());
    return { fields, raw: { matched: !!c } };
  },
};

export const LOCAL_ENRICHERS: Enricher[] = [emailEnricher, geoEnricher, userAgentEnricher, companyEnricher];

/** Pick email/domain/company hints out of arbitrary submitted fields. */
export function extractHints(data: Record<string, unknown>) {
  const entries = Object.entries(data);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  let email: string | null = null;
  const emailKey = entries.find(([k, v]) => /e-?mail/i.test(k) && EMAIL_RE.test(str(v))) ?? entries.find(([, v]) => EMAIL_RE.test(str(v)));
  if (emailKey) email = str(emailKey[1]).toLowerCase();
  else {
    const anyEmail = entries.find(([k]) => /e-?mail/i.test(k));
    if (anyEmail && str(anyEmail[1])) email = str(anyEmail[1]).toLowerCase();
  }
  let domain: string | null = null;
  const site = entries.find(([k, v]) => /web|site|url|domain|homepage/i.test(k) && str(v));
  if (site) domain = domainFromUrl(str(site[1]));
  if (!domain && email && EMAIL_RE.test(email)) {
    const d = email.split("@")[1];
    if (!FREE_EMAIL_PROVIDERS.has(d) && !isDisposable(d)) domain = d;
  }
  const companyEntry = entries.find(([k, v]) => /^(company|organi[sz]ation|business|company_name|org)$/i.test(k) && str(v));
  const nameEntry = entries.find(([k, v]) => /^(name|full_?name|first_?name|your_?name)$/i.test(k) && str(v));
  return { email, domain, companyName: companyEntry ? str(companyEntry[1]) : null, name: nameEntry ? str(nameEntry[1]) : null };
}
