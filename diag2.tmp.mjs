import { chromium } from "@playwright/test";
import fs from "node:fs";
const ids = JSON.parse(fs.readFileSync("e2e/.auth/ids.json","utf8"));
const [w, ...urls] = process.argv.slice(2);
const b = await chromium.launch();
const c = await b.newContext({ storageState: "e2e/.auth/demo.json", baseURL: "http://127.0.0.1:3100", viewport: { width: +w, height: 800 } });
const p = await c.newPage();
for (const u0 of urls) {
  const u = u0.replace("{FORM}", ids.formId).replace("{SUB}", ids.submissionId);
  await p.goto(u); await p.waitForLoadState("networkidle");
  const r = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const rc = el.getBoundingClientRect();
      if (rc.right <= vw + 1 || rc.width === 0) continue;
      let clipped = false;
      for (let q = el.parentElement; q && q !== document.body; q = q.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(q).overflowX)) { clipped = true; break; }
      if (clipped) continue;
      // only report the deepest offenders whose parent fits
      const pr = el.parentElement.getBoundingClientRect();
      if (pr.right > vw + 1) continue;
      out.push(`${el.tagName} w=${Math.round(rc.width)} right=${Math.round(rc.right)} cls="${String(el.className).slice(0,120)}" text="${(el.textContent||"").trim().slice(0,60)}"`);
    }
    return { sw: document.documentElement.scrollWidth, vw, out: out.slice(0, 6) };
  });
  console.log(u0, r.sw, r.vw); for (const o of r.out) console.log("   ", o);
}
await b.close();
