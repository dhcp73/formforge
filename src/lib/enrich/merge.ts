import { PROVIDER_PRIORITY, type Enrichment, type ProviderId } from "./types";

export function emptyEnrichment(): Enrichment {
  return { attribution: {}, providers: {} };
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const p of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Waterfall merge: a field is written when it is unset, or the incoming provider
 * has a higher priority (lower number) than the provider that set it.
 */
export function mergeFields(e: Enrichment, source: ProviderId, fields: Record<string, unknown>): string[] {
  const written: string[] = [];
  for (const [path, value] of Object.entries(fields)) {
    if (isEmpty(value)) continue;
    const current = e.attribution[path];
    if (!current || PROVIDER_PRIORITY[source] <= PROVIDER_PRIORITY[current]) {
      setPath(e as unknown as Record<string, unknown>, path, value);
      e.attribution[path] = source;
      written.push(path);
    }
  }
  return written;
}
