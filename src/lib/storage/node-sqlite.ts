/**
 * Thin better-sqlite3-compatible wrapper around Node's built-in `node:sqlite` (DatabaseSync).
 * Used when STORAGE_MODE=browser|memory so we never load the better-sqlite3 native addon
 * (required for Vercel / environments without native bindings).
 */
import { DatabaseSync } from "node:sqlite";

export type Stmt = {
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
};

export type DbLike = {
  prepare: (sql: string) => Stmt;
  exec: (sql: string) => void;
  pragma: (src: string) => unknown;
  transaction: <T>(fn: () => T) => () => T;
  close: () => void;
};

export function openNodeSqlite(path: string): DbLike {
  const db = new DatabaseSync(path === ":memory:" ? ":memory:" : path);
  return {
    prepare(sql: string): Stmt {
      const stmt = db.prepare(sql);
      return {
        run: (...params: unknown[]) => {
          const r = stmt.run(...(params as never[]));
          return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid };
        },
        get: (...params: unknown[]) => stmt.get(...(params as never[])),
        all: (...params: unknown[]) => stmt.all(...(params as never[])) as unknown[],
      };
    },
    exec(sql: string) { db.exec(sql); },
    pragma(src: string) {
      try { db.exec(`PRAGMA ${src}`); } catch { /* ignore unsupported pragmas on memory */ }
      return null;
    },
    transaction<T>(fn: () => T) {
      return () => {
        db.exec("BEGIN");
        try {
          const r = fn();
          db.exec("COMMIT");
          return r;
        } catch (e) {
          try { db.exec("ROLLBACK"); } catch { /* ignore */ }
          throw e;
        }
      };
    },
    close() { try { db.close(); } catch { /* ignore */ } },
  };
}
