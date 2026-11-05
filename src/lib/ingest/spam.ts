export const SPAM_KEYWORDS = [
  "viagra", "cialis", "casino", "crypto", "bitcoin", "forex", "seo services", "backlinks", "rank your website", "loan", "payday",
  "porn", "xxx", "escort", "click here", "buy now", "whatsapp", "telegram", "100% free", "make money", "work from home", "guest post",
  "sigma male", "investment opportunity", "nft", "betting",
];

export interface SpamInput {
  data: Record<string, unknown>;
  honeypotTriggered: boolean;
  email?: { syntaxValid?: boolean; disposable?: boolean; mx?: boolean | null } | null;
  userAgent: string | null;
  isBot?: boolean;
  duplicate: boolean;
  elapsedMs?: number | null;
}

/** Transparent, explainable spam score 0–100 with reasons (no black box). */
export function scoreSpam(i: SpamInput): { score: number; reasons: string[] } {
  if (i.honeypotTriggered) return { score: 100, reasons: ["Honeypot field was filled"] };
  let score = 0;
  const reasons: string[] = [];
  const add = (n: number, r: string) => { score += n; reasons.push(`${r} (+${n})`); };
  const text = Object.values(i.data).filter((v) => typeof v === "string").join(" \n ");
  const lower = text.toLowerCase();
  const links = (text.match(/https?:\/\/|www\./gi) ?? []).length;
  if (links >= 3) add(30, `${links} links`); else if (links > 0) add(10, `${links} link(s)`);
  if (/\[url=|\[link=|<a\s+href/i.test(text)) add(30, "BBCode/HTML links");
  const kw = SPAM_KEYWORDS.filter((k) => lower.includes(k));
  if (kw.length) add(Math.min(45, kw.length * 15), `Spam keywords: ${kw.slice(0, 3).join(", ")}`);
  if (i.email?.disposable) add(30, "Disposable email domain");
  if (i.email && i.email.syntaxValid === false) add(20, "Invalid email syntax");
  if (i.email?.mx === false) add(15, "Email domain has no MX records");
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 20 && letters === letters.toUpperCase()) add(10, "All caps message");
  if (!i.userAgent) add(15, "Missing user-agent");
  else if (i.isBot) add(20, "Automated client user-agent");
  if (i.duplicate) add(30, "Duplicate of a recent submission");
  if (i.elapsedMs != null && i.elapsedMs >= 0 && i.elapsedMs < 1500) add(25, "Submitted too fast");
  if (/(.)\1{9,}/.test(text)) add(10, "Repeated characters");
  return { score: Math.min(100, score), reasons };
}
