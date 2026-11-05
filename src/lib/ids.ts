import crypto from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function randomString(len: number): string {
  const bytes = crypto.randomBytes(len * 2);
  let out = "";
  for (let i = 0; i < bytes.length && out.length < len; i++) {
    const b = bytes[i];
    if (b < 248) out += ALPHABET[b % 62];
  }
  while (out.length < len) out += ALPHABET[crypto.randomInt(62)];
  return out;
}

export const newId = (prefix: string, len = 16) => `${prefix}_${randomString(len)}`;
export const newFormId = () => randomString(10);

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
