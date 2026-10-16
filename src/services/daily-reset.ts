import { SQL } from '../config/sql';
import type { D1Like } from '../infra/d1';
import { trace } from '../infra/trace';

/** 日次リセットの対象テーブル（子から順）。 */
export const DAILY_RESET_TABLES = ['conversions', 'assignments', 'variants', 'experiments'] as const;

/** 全テーブルの行を削除する。1 回の batch（トランザクション）で行い、途中失敗は全体を取り消す。 */
export async function runDailyReset(db: D1Like): Promise<void> {
  const statements = [
    SQL.DELETE_CONVERSIONS,
    SQL.DELETE_ASSIGNMENTS,
    SQL.DELETE_VARIANTS,
    SQL.DELETE_EXPERIMENTS,
  ].map((query) => db.prepare(query));
  await db.batch(statements);
  trace('daily_reset.completed', { tables: DAILY_RESET_TABLES.length });
}
