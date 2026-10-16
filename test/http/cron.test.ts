import { readFileSync } from 'fs';
import { join } from 'path';
import { createTestApp, TestApp } from '../support/app';
import { createExperiment, newSession, OwnerSession, startExperiment } from '../support/fixtures';
import { DAILY_RESET } from '../../src/config/http';
import { runDailyReset, DAILY_RESET_TABLES } from '../../src/services/daily-reset';
import { scheduled } from '../../src/index';

const ROOT = join(__dirname, '..', '..');

function countRows(app: TestApp, table: string): number {
  return (app.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe('日次リセット（要件 7）', () => {
  let app: TestApp;
  let owner: OwnerSession;

  beforeEach(async () => {
    app = createTestApp();
    owner = await newSession(app);
  });

  it('Cron Triggers の式は UTC 18:00（JST 03:00）の 0 18 * * * である', () => {
    expect(DAILY_RESET.CRON).toBe('0 18 * * *');
    const toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');
    expect(toml).toContain(`crons = ["${DAILY_RESET.CRON}"]`);
  });

  it('リセットは全テーブルの行を削除し、子テーブルから順に処理する', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    await app.send({ path: `/t/${created.publicKey}/assign?visitor_id=v-1` });
    await app.send({ method: 'POST', path: `/t/${created.publicKey}/convert`, json: { visitorId: 'v-1', goalName: 'purchase' } });
    expect(countRows(app, 'experiments')).toBe(1);

    await runDailyReset(app.deps.db);

    for (const table of DAILY_RESET_TABLES) {
      expect([table, countRows(app, table)]).toEqual([table, 0]);
    }
  });

  it('リセット後は新しい実験を作成できる（スキーマは残る）', async () => {
    await runDailyReset(app.deps.db);
    const created = await createExperiment(app, owner);
    expect(created.publicKey).toMatch(/^[0-9a-f]{32}$/);
  });

  it('scheduled ハンドラは設定した Cron の式に一致するときだけリセットし、不一致なら例外を投げる', async () => {
    const created = await createExperiment(app, owner);
    const env = { DB: app.deps.db };
    const waited: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => waited.push(promise), passThroughOnException: () => undefined };

    await expect(scheduled({ cron: '0 3 * * *', scheduledTime: Date.now() } as never, env, ctx as never)).rejects.toThrow(
      /0 3 \* \* \*/,
    );
    expect(countRows(app, 'experiments')).toBe(1);

    await scheduled({ cron: DAILY_RESET.CRON, scheduledTime: Date.now() } as never, env, ctx as never);
    await Promise.all(waited);
    expect(countRows(app, 'experiments')).toBe(0);
    expect(created.id).toBeTruthy();
  });
});
