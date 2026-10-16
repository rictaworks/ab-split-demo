import { createTestApp, TestApp } from '../support/app';
import { createExperiment, experimentBody, newSession, OwnerSession } from '../support/fixtures';
import { SERVICE_MESSAGE } from '../../src/config/messages';
import type { D1Like } from '../../src/infra/d1';

/** 最初の batch の直前に、状態を直接書き換える DB ラッパー（読み取り後に状態が変わった状況の再現）。 */
function interceptFirstBatch(app: TestApp, beforeBatch: () => void): void {
  const original: D1Like = app.deps.db;
  let fired = false;
  const wrapped: D1Like = {
    prepare: (query: string) => original.prepare(query),
    batch: (statements) => {
      if (!fired) {
        fired = true;
        beforeBatch();
      }
      return original.batch(statements);
    },
  } as D1Like;
  (app.deps as { db: D1Like }).db = wrapped;
}

describe('低-1: 更新は読み取り時の状態を条件にする（競合は 409）', () => {
  let app: TestApp;
  let owner: OwnerSession;

  beforeEach(async () => {
    app = createTestApp();
    owner = await newSession(app);
  });

  it('読み取りのあとに状態が変わった場合は 409 で失敗し、ゴール名は変わらない', async () => {
    const created = await createExperiment(app, owner);
    interceptFirstBatch(app, () => {
      app.raw.prepare("UPDATE experiments SET status = 'running' WHERE id = ?").run(created.id);
    });
    const response = await app.send({
      method: 'PUT',
      path: `/api/experiments/${created.id}`,
      cookie: owner.cookie,
      json: experimentBody({ goalName: 'signup', name: '競合' }),
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe(SERVICE_MESSAGE.CONCURRENT_UPDATE);
    const row = app.raw.prepare('SELECT goal_name, name FROM experiments WHERE id = ?').get(created.id) as {
      goal_name: string;
      name: string;
    };
    expect(row.goal_name).toBe('purchase');
    expect(row.name).not.toBe('競合');
  });

  it('状態が変わっていなければ従来どおり 200 で更新できる', async () => {
    const created = await createExperiment(app, owner);
    const response = await app.send({
      method: 'PUT',
      path: `/api/experiments/${created.id}`,
      cookie: owner.cookie,
      json: experimentBody({ goalName: 'signup' }),
    });
    expect(response.status).toBe(200);
  });
});
