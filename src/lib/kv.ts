import { getDb } from "./db";
export function kvGet(key: string): string | null {
  const r = getDb().prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? null;
}
export function kvSet(key: string, value: string) {
  getDb().prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
