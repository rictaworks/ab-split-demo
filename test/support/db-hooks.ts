import type { D1Like, D1PreparedLike, D1Result } from '../../src/infra/d1';

export type QueryHook = (query: string) => void;

/**
 * 並行リクエストを再現するための D1 ラッパ。
 * 文の実行直後（afterRun）と batch の直前（beforeBatch）に処理を差し込み、
 * 「件数を読んだ後で、別の要求が先に書き込んだ」状況をテストで作る。
 */
export function interceptDb(
  db: D1Like,
  hooks: { afterRun?: QueryHook; beforeBatch?: () => void },
): D1Like {
  const wrap = (query: string, inner: D1PreparedLike): D1PreparedLike => ({
    bind: (...values: unknown[]) => wrap(query, inner.bind(...values)),
    first: async <T>(column?: string): Promise<T | null> => {
      const result = await inner.first<T>(column);
      hooks.afterRun?.(query);
      return result;
    },
    all: async <T>(): Promise<D1Result<T>> => {
      const result = await inner.all<T>();
      hooks.afterRun?.(query);
      return result;
    },
    run: async (): Promise<D1Result> => {
      const result = await inner.run();
      hooks.afterRun?.(query);
      return result;
    },
  });
  return {
    prepare: (query: string) => wrap(query, db.prepare(query)),
    batch: async <T>(statements: D1PreparedLike[]): Promise<D1Result<T>[]> => {
      hooks.beforeBatch?.();
      return db.batch<T>(statements);
    },
  };
}
