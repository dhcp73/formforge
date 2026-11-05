import fs from "node:fs";
import path from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import { AUTH_FILE, IDS_FILE, BASE, DEMO } from "./support";

export default async function globalSetup(_config: FullConfig) {
  void _config;
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  const key = (process.env.FORMFORGE_DEMO_KEY || fs.readFileSync(path.join(process.cwd(), "data", "demo-api-key.txt"), "utf8")).trim();
  const get = async (p: string) => { const r = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${key}` } }); if (!r.ok) throw new Error(`${p} → ${r.status}`); return r.json(); };
  const forms = (await get("/api/v1/forms")).data as { id: string; name: string; settings: { fields: unknown[] } }[];
  const sales = forms.find((f) => f.name === "Contact sales") ?? forms[0];
  const schema = forms.find((f) => f.settings.fields.length) ?? sales;
  const subs = (await get(`/api/v1/forms/${sales.id}/submissions?limit=1`)).data as { id: string }[];
  fs.writeFileSync(IDS_FILE, JSON.stringify({ formId: sales.id, schemaFormId: schema.id, submissionId: subs[0].id }));

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: BASE });
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await page.context().storageState({ path: AUTH_FILE });
  await browser.close();
}
