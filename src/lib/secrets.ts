import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./db";

let cachedKey: Buffer | null = null;

/** 32-byte key from FORMFORGE_SECRET (any string, hashed) or an auto-generated data/.secret file. */
function key(): Buffer {
  if (cachedKey) return cachedKey;
  let raw = process.env.FORMFORGE_SECRET;
  if (!raw) {
    const file = path.join(dataDir(), ".secret");
    if (fs.existsSync(file)) raw = fs.readFileSync(file, "utf8").trim();
    else {
      raw = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(file, raw, { mode: 0o600 });
    }
  }
  cachedKey = crypto.createHash("sha256").update(raw).digest();
  return cachedKey;
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decrypt(token: string): string {
  const [v, iv, tag, enc] = token.split(".");
  if (v !== "v1") throw new Error("Unsupported secret format");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function hmacHex(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function maskSecret(s: string | undefined | null): string {
  if (!s) return "";
  if (s.length <= 8) return "••••";
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}
