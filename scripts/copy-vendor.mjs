// Copies the Scalar API reference bundle into /public so /docs/api works offline (no CDN).
import fs from "node:fs";
import path from "node:path";
const src = path.join("node_modules", "@scalar", "api-reference", "dist", "browser", "standalone.js");
const dst = path.join("public", "vendor", "scalar.js");
if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); console.log("copied", dst); }
else console.warn("Scalar standalone bundle not found at", src);
