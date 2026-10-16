import { readFileSync } from 'fs';
import { join } from 'path';
import { DatabaseSync, StatementSync } from 'node:sqlite';

type SQLInputValue = string | number | bigint | Uint8Array | null;
import type { D1Like, D1PreparedLike, D1Result } from '../../src/infra/d1';

const MIGRATION_PATH = join(__dirname, '..', '..', 'migrations', '0001_init.sql');

/** テスト用に、実 SQLite（node:sqlite）で D1 互換の最小インターフェースを提供する。 */
export function openMigratedDatabase(): DatabaseSync {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec(readFileSync(MIGRATION_PATH, 'utf8'));
  return raw;
}

export function adaptSqlite(raw: DatabaseSync): D1Like {
  const prepare = (query: string, values: unknown[] = []): D1PreparedLike => ({
    bind: (...bound: unknown[]) => prepare(query, bound),
    first: async <T>(column?: string): Promise<T | null> => {
      const row = statement(raw, query).get(...(values as SQLInputValue[])) as Record<string, unknown> | undefined;
      if (row === undefined) {
        return null;
      }
      if (column !== undefined) {
        return row[column] as T;
      }
      return row as T;
    },
    all: async <T>(): Promise<D1Result<T>> => ({
      results: statement(raw, query).all(...(values as SQLInputValue[])) as T[],
      success: true,
      meta: { changes: 0 },
    }),
    run: async (): Promise<D1Result> => {
      const info = statement(raw, query).run(...(values as SQLInputValue[]));
      return { results: [], success: true, meta: { changes: Number(info.changes) } };
    },
  });
  return {
    prepare: (query: string) => prepare(query),
    batch: async <T>(statements: D1PreparedLike[]): Promise<D1Result<T>[]> => {
      raw.exec('BEGIN');
      try {
        const results: D1Result<T>[] = [];
        for (const statement of statements) {
          results.push((await statement.run()) as D1Result<T>);
        }
        raw.exec('COMMIT');
        return results;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

const CACHE = new WeakMap<DatabaseSync, Map<string, StatementSync>>();

function statement(raw: DatabaseSync, query: string): StatementSync {
  let cache = CACHE.get(raw);
  if (cache === undefined) {
    cache = new Map();
    CACHE.set(raw, cache);
  }
  let stmt = cache.get(query);
  if (stmt === undefined) {
    stmt = raw.prepare(query);
    cache.set(query, stmt);
  }
  return stmt;
}
