/**
 * Seed a realistic demo workspace:
 *   demo@formforge.dev / demo1234
 * Idempotent: if the demo user exists, nothing happens unless --reset is passed (which wipes the DB file).
 */
import fs from "node:fs";
import { getDb, dbPath, now } from "@/lib/db";
import { createUser } from "@/lib/auth";
import { createForm } from "@/lib/forms";
import { ingest } from "@/lib/ingest";
import { processSubmission } from "@/lib/processing";
import { createRule } from "@/lib/routing";
import { createWebhook } from "@/lib/webhooks";
import { createSchedule } from "@/lib/schedules";
import { createApiKey } from "@/lib/apikeys";
import { SCOPES } from "@/lib/types";
import { resetRateLimits } from "@/lib/ingest/ratelimit";

process.env.FORMFORGE_DNS ??= "off"; // deterministic + offline
const reset = process.argv.includes("--reset");
if (reset) for (const f of [dbPath(), `${dbPath()}-wal`, `${dbPath()}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);

const db = getDb();
if (db.prepare("SELECT 1 FROM users WHERE email = 'demo@formforge.dev'").get()) {
  console.log("Demo user already exists — run `npm run seed -- --reset` to recreate.");
  process.exit(0);
}

let seed = 42;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const { workspaceId: ws, userId } = createUser({ email: "demo@formforge.dev", name: "Demo User", password: "demo1234", workspaceName: "Acme Growth" });
db.prepare("UPDATE workspaces SET name = 'Acme Growth' WHERE id = ?").run(ws);

const sales = createForm(ws, { name: "Contact sales", description: "Demo-request form on acme.io/pricing", settings: { notifyEmails: ["sales@acme.io"], autoresponder: { enabled: true, subject: "Thanks {{name}} — we'll be in touch", body: "Hi {{name}},\n\nThanks for reaching out to Acme. A specialist will reply within one business day.\n\n— The Acme team" } } as never });
const newsletter = createForm(ws, { name: "Newsletter signup", description: "Footer signup on the blog" });
const beta = createForm(ws, {
  name: "Beta waitlist", description: "Private beta for the new analytics product",
  settings: { schemaMode: "validate", maxSubmissions: 500, fields: [
    { name: "email", label: "Work email", type: "email", required: true },
    { name: "name", label: "Full name", type: "text", required: true },
    { name: "company", label: "Company", type: "text", required: false },
    { name: "role", label: "Your role", type: "select", required: false, options: ["Engineering", "Product", "Growth", "Other"] },
    { name: "role_other", label: "Which role?", type: "text", required: true, showIf: { field: "role", op: "eq", value: "Other" } },
    { name: "team_size", label: "Team size", type: "number", required: false, showIf: { field: "role", op: "in", value: ["Engineering", "Product"] } },
    { name: "use_case", label: "What would you use it for?", type: "longtext", required: false },
  ] } as never,
});
const support = createForm(ws, { name: "Support request", description: "In-app help widget", settings: { spamThreshold: 50 } as never });

createRule(ws, { name: "Enterprise (200+ employees) → AE team", priority: 10, match: "all", conditions: [{ field: "company.employees", op: "gte", value: 200 }], actions: { assignTo: ["ava@acme.io", "sam@acme.io"], weights: { "ava@acme.io": 2, "sam@acme.io": 1 }, sticky: true, tags: ["enterprise"], bookingUrl: "https://cal.com/{{owner_name}}/intro?email={{email}}", ownerBookingUrls: { "ava@acme.io": "https://cal.com/ava-acme/enterprise-demo" } }, stopOnMatch: true });
createRule(ws, { name: "Strategic accounts (named domains) → Ava", priority: 8, match: "any", conditions: [{ field: "company.domain", op: "in", value: ["stripe.com", "openai.com", "shopify.com"] }, { field: "email.domain", op: "ends_with", value: ".gov" }], actions: { assignTo: ["ava@acme.io"], sticky: true, tags: ["strategic"], bookingUrl: "https://cal.com/ava-acme/enterprise-demo" }, stopOnMatch: true });
createRule(ws, { name: "UK & EU mid-market → EMEA rep", priority: 20, match: "all", conditions: [{ field: "geo.country", op: "in", value: ["GB", "DE", "FR", "NL", "SE", "IE", "ES"] }, { field: "email.freeProvider", op: "eq", value: false }], actions: { assignTo: ["lena@acme.io"], tags: ["emea"] }, stopOnMatch: true });
createRule(ws, { name: "Startups → self-serve", priority: 30, match: "any", conditions: [{ field: "company.employees", op: "lt", value: 50 }, { field: "email.freeProvider", op: "eq", value: true }], actions: { assignTo: ["growth@acme.io"], tags: ["self-serve"] }, stopOnMatch: true });
createRule(ws, { name: "Support requests → helpdesk", priority: 5, formId: support.id, match: "all", conditions: [{ field: "data.message", op: "exists" }], actions: { assignTo: ["support@acme.io"], tags: ["support"] }, stopOnMatch: true });

const port = process.env.PORT ?? "3100";
createWebhook(ws, sales.id, { url: `http://127.0.0.1:${port}/api/internal/echo`, events: ["submission.created", "submission.enriched"] });
createSchedule(ws, sales.id, { name: "Daily sales digest", kind: "digest", cron: "0 9 * * 1-5", timezone: "Europe/London", config: { recipients: ["sales@acme.io"] } });
createSchedule(ws, newsletter.id, { name: "Weekly CSV export", kind: "csv_export", cron: "0 7 * * 1", timezone: "Europe/London", config: {} });

const { key } = createApiKey(ws, "Demo key (all scopes)", [...SCOPES], userId, null);
createApiKey(ws, "Website (read-only)", ["forms:read", "submissions:read"], userId, null);

const PEOPLE = [
  ["Ada Lovelace", "stripe.com"], ["Grace Hopper", "shopify.com"], ["Alan Turing", "monzo.com"], ["Katherine Johnson", "vercel.com"], ["Linus Park", "linear.app"],
  ["Mei Chen", "notion.so"], ["Sofia Rossi", "figma.com"], ["Jonas Berg", "klarna.com"], ["Amara Okafor", "wise.com"], ["Lukas Meyer", "n26.com"],
  ["Priya Nair", "atlassian.com"], ["Hiro Tanaka", "canva.com"], ["Elena Petrova", "revolut.com"], ["Tom Hughes", "deliveroo.co.uk"], ["Noah Kim", "datadoghq.com"],
  ["Chloe Martin", "hubspot.com"], ["Omar Haddad", "acme.io"], ["Isla Brown", "globex.com"], ["Ravi Shah", "initech.com"], ["Zoe Walker", "gmail.com"],
  ["Diego Alvarez", "outlook.com"], ["Fatima Zahra", "sap.com"], ["Ben Carter", "airbnb.com"], ["Lea Dubois", "spotify.com"], ["Max Weber", "github.com"],
];
const IPS = ["81.2.69.142", "2.125.160.216", "86.24.13.5", "62.30.112.1", "5.9.0.1", "91.198.174.192", "80.12.0.1", "145.97.0.1", "8.8.8.8", "104.16.0.1", "24.48.0.1", "203.0.113.9", "49.36.0.1", "1.0.16.1", "177.10.0.1", "41.0.0.1"];
const UAS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
];
const MESSAGES = ["We're evaluating form backends for 40 marketing sites — can we get a demo?", "Looking for SSO and EU data residency. What does enterprise pricing look like?", "Need to route leads to Salesforce based on company size.", "Can FormForge replace our Formcarry setup? We get ~20k submissions/month.", "Interested in the MCP server for our internal agents.", "Do you support file uploads up to 10MB?", "Quick question about webhooks retries.", "Our team wants enrichment with Apollo + Clay in one place."];
const SPAM = [
  { name: "Best SEO", email: "seo@mailinator.com", message: "BUY CHEAP BACKLINKS NOW!!! http://spam.example http://spam2.example http://x.example casino crypto viagra" },
  { name: "Loan Offer", email: "offer@10minutemail.com", message: "Guaranteed loan approval, click here: http://bad.example http://bad2.example http://bad3.example" },
];

async function post(formId: string, body: Record<string, unknown>, ip: string, ua: string) {
  const req = new Request(`http://localhost:${port}/api/f/${formId}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "x-forwarded-for": ip, "user-agent": ua, origin: "https://acme.io", referer: "https://acme.io/pricing" }, body: JSON.stringify(body) });
  const r = await ingest(formId, req);
  await processSubmission(r.id);
  return r.id;
}

const ids: string[] = [];
const N = 140;
for (let i = 0; i < N; i++) {
  resetRateLimits();
  const [name, domain] = pick(PEOPLE);
  const first = name.split(" ")[0].toLowerCase();
  const email = `${first}.${name.split(" ")[1].toLowerCase()}${domain.includes("gmail") || domain.includes("outlook") ? Math.floor(rnd() * 90 + 10) : ""}@${domain}`;
  const company = domain.includes("gmail") || domain.includes("outlook") ? "" : domain.split(".")[0].replace(/^./, (c) => c.toUpperCase());
  const r = rnd();
  const ip = pick(IPS);
  const ua = pick(UAS);
  let id: string;
  if (r < 0.45) id = await post(sales.id, { name, email, company, role: pick(["Head of Growth", "CTO", "VP Marketing", "Engineer", "Founder", "Product Manager"]), budget: pick(["< $1k", "$1k–$5k", "$5k–$20k", "$20k+"]), message: pick(MESSAGES) }, ip, ua);
  else if (r < 0.65) id = await post(newsletter.id, { email, source: pick(["blog", "footer", "pricing"]) }, ip, ua);
  else if (r < 0.85) id = await post(beta.id, { email, name, company, team_size: String(Math.floor(rnd() * 200) + 2), use_case: pick(MESSAGES) }, ip, ua);
  else if (r < 0.95) id = await post(support.id, { name, email, message: pick(["I can't find my API key.", "Webhook deliveries failing with 401.", "How do I export to CSV?", "Can I change the redirect URL per page?"]), priority: pick(["low", "normal", "high"]) }, ip, ua);
  else id = await post(pick([sales.id, support.id]), { ...pick(SPAM), _gotcha: rnd() < 0.3 ? "http://bot" : "" }, pick(IPS), "python-requests/2.31");
  ids.push(id);
}

// Spread timestamps over the last 30 days (more recent = denser), newest last.
const nowMs = Date.now();
ids.forEach((id, i) => {
  const ageDays = Math.pow(1 - i / N, 1.6) * 29.5;
  const t = new Date(nowMs - ageDays * 864e5 - rnd() * 36e5).toISOString();
  db.prepare("UPDATE submissions SET created_at = ?, status = ? WHERE id = ?").run(t, rnd() < 0.55 ? "read" : "new", id);
});
fs.writeFileSync(`${process.cwd()}/data/demo-api-key.txt`, key + "\n", { mode: 0o600 });
console.log(`Seeded workspace "Acme Growth" with 4 forms, ${N} submissions, 4 routing rules, 1 webhook, 2 schedules — at ${now()}`);
console.log("Login: demo@formforge.dev / demo1234");
console.log(`Demo API key written to data/demo-api-key.txt (${key.slice(0, 14)}…)`);
