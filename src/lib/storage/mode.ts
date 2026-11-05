/** Storage mode for FormForge persistence. */
export type StorageMode = "sqlite" | "memory" | "browser";

export function storageMode(): StorageMode {
  const m = (process.env.STORAGE_MODE || "sqlite").toLowerCase();
  if (m === "browser" || m === "memory" || m === "sqlite") return m;
  return "sqlite";
}

export function isBrowserMode() {
  return storageMode() === "browser";
}

export function isEphemeralMode() {
  const m = storageMode();
  return m === "browser" || m === "memory";
}
