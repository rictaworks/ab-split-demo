import { createTestApp, TestApp } from '../support/app';
import { interceptDb } from '../support/db-hooks';
import { createExperiment, experimentBody, newSession, OwnerSession, startExperiment } from '../support/fixtures';
import { EXPERIMENT_LIMITS } from '../../src/config/domain';
import { SQL } from '../../src/config/sql';
import { bucketOf, selectVariantId } from '../../src/core/assign';

const NOW = '2026-10-17T00:00:00.000Z';

function count(app: TestApp, sql: string, ...params: string[]): number {
  return (app.raw.prepare(sql).get(...params) as { n: number }).n;
}

function seedExperiments(app: TestApp, owner: string, howMany: number): void {
  const insert = app.raw.prepare(
    'INSERT INTO experiments (id, owner_session_id, public_key, name, status, goal_name, min_sample, created_at) ' +
      "VALUES (?, ?, ?, 'seed', 'draft', 'g', 1, ?)",
  );
  for (let i = 0; i < howMany; i += 1) {
    insert.run(`seed-exp-${i}`, owner, `${i}`.padStart(32, 'e'), NOW);
  }
}

function seedAssignments(app: TestApp, experimentId: string, howMany: number, tag: string): void {
  const variant = app.raw
    .prepare('SELECT id FROM variants WHERE experiment_id = ? AND position = 0')
    .get(experimentId) as { id: string };
  app.raw.exec('BEGIN');
  const insert = app.raw.prepare(
    'INSERT INTO assignments (id, experiment_id, owner_session_id, visitor_id, variant_id, assigned_at) ' +
      'SELECT ?, id, owner_session_id, ?, ?, ? FROM experiments WHERE id = ?',
  );
  for (let i = 0; i < howMany; i += 1) {
    insert.run(`${tag}-${i}`, `${tag}-visitor-${i}`, variant.id, NOW, experimentId);
  }
  app.raw.exec('COMMIT');
}

function ownerOf(cookie: string): string {
  return cookie.split('=')[1]!;
}

describe('並行リクエストでも上限を超えない（条件付き挿入）', () => {
  let app: TestApp;
  let owner: OwnerSession;

  beforeEach(async () => {
    app = createTestApp();
    owner = await newSession(app);
  });

  it('実験数: 件数を読んだ後に別の要求が 5 件に達しても、6 件目は 409 で拒否し保存しない', async () => {
    for (let i = 0; i < 4; i += 1) {
      await createExperiment(app, owner);
    }
    let raced = false;
    const deps = {
      ...app.deps,
      db: interceptDb(app.deps.db, {
        afterRun: (query) => {
          if (query === SQL.EXPERIMENT_COUNT_BY_OWNER && !raced) {
            raced = true;
            seedExperiments(app, ownerOf(owner.cookie), 1);
          }
        },
      }),
    };
    const { handleRequest } = await import('../../src/http/router');
    const response = await handleRequest(
      new Request('https://demo.example.test/api/experiments', {
        method: 'POST',
        headers: { cookie: owner.cookie, 'content-type': 'application/json' },
        body: JSON.stringify(experimentBody()),
      }),
      deps,
    );
    expect(raced).toBe(true);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('experiment_limit_reached');
    expect(count(app, 'SELECT COUNT(*) AS n FROM experiments WHERE owner_session_id = ?', ownerOf(owner.cookie))).toBe(
      EXPERIMENT_LIMITS.MAX_EXPERIMENTS_PER_SESSION,
    );
    expect(count(app, "SELECT COUNT(*) AS n FROM variants WHERE experiment_id NOT LIKE 'seed-exp-%'")).toBe(4 * 2);
  });

  it('割当: 件数を読んだ後に上限へ達したら、保存せず対照を返し、capped にする', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    seedAssignments(app, created.id, EXPERIMENT_LIMITS.EVENT_LIMIT - 2, 'a');
    // ハッシュで対照以外に割り当たる訪問者 ID を選ぶ。
    let visitor = '';
    for (let i = 0; i < 100 && visitor === ''; i += 1) {
      const candidate = `probe-${i}`;
      const picked = selectVariantId(
        created.variantIds.map((id) => ({ id, weight: 1 })),
        bucketOf(created.publicKey, candidate),
      );
      if (picked !== created.variantIds[0]) {
        visitor = candidate;
      }
    }
    expect(visitor).not.toBe('');

    let raced = false;
    const deps = {
      ...app.deps,
      db: interceptDb(app.deps.db, {
        afterRun: (query) => {
          if (query === SQL.ASSIGNMENT_SELECT && !raced) {
            raced = true;
            seedAssignments(app, created.id, 2, 'b');
          }
        },
      }),
    };
    const { handleRequest } = await import('../../src/http/router');
    const response = await handleRequest(
      new Request(`https://demo.example.test/t/${created.publicKey}/assign?visitor_id=${visitor}`),
      deps,
    );
    expect(raced).toBe(true);
    const body = (await response.json()) as { variant: { key: string } };
    expect(body.variant.key).toBe('control');
    expect(count(app, 'SELECT COUNT(*) AS n FROM assignments WHERE experiment_id = ?', created.id)).toBe(
      EXPERIMENT_LIMITS.EVENT_LIMIT,
    );
    expect(count(app, 'SELECT COUNT(*) AS n FROM assignments WHERE visitor_id = ?', visitor)).toBe(0);
    const status = app.raw.prepare('SELECT status FROM experiments WHERE id = ?').get(created.id) as { status: string };
    expect(status.status).toBe('capped');
  });

  it('転換: 件数を読んだ後に上限へ達したら、記録しない', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    await app.send({ path: `/t/${created.publicKey}/assign?visitor_id=early` });
    seedAssignments(app, created.id, EXPERIMENT_LIMITS.EVENT_LIMIT - 3, 'c');

    let raced = false;
    const deps = {
      ...app.deps,
      db: interceptDb(app.deps.db, {
        afterRun: (query) => {
          if (query === SQL.CONVERSION_GOALS_BY_ASSIGNMENT && !raced) {
            raced = true;
            seedAssignments(app, created.id, 2, 'd');
          }
        },
      }),
    };
    const { handleRequest } = await import('../../src/http/router');
    const response = await handleRequest(
      new Request(`https://demo.example.test/t/${created.publicKey}/convert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visitorId: 'early', goalName: 'purchase' }),
      }),
      deps,
    );
    expect(raced).toBe(true);
    expect(await response.json()).toEqual({ ok: false });
    expect(count(app, 'SELECT COUNT(*) AS n FROM conversions')).toBe(0);
    const status = app.raw.prepare('SELECT status FROM experiments WHERE id = ?').get(created.id) as { status: string };
    expect(status.status).toBe('capped');
  });

  it('模擬: batch の直前に別の要求が書き込んでも、合計は上限を超えない', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    seedAssignments(app, created.id, EXPERIMENT_LIMITS.EVENT_LIMIT - 10, 'e');

    let raced = false;
    const deps = {
      ...app.deps,
      db: interceptDb(app.deps.db, {
        beforeBatch: () => {
          if (!raced) {
            raced = true;
            seedAssignments(app, created.id, 5, 'f');
          }
        },
      }),
    };
    const rates = Object.fromEntries(created.variantIds.map((id) => [id, 0.5]));
    const { handleRequest } = await import('../../src/http/router');
    const response = await handleRequest(
      new Request(`https://demo.example.test/api/experiments/${created.id}/simulate`, {
        method: 'POST',
        headers: { cookie: owner.cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ visitorCount: 100, conversionRates: rates }),
      }),
      deps,
    );
    expect(raced).toBe(true);
    expect(response.status).toBe(200);
    const assignments = count(app, 'SELECT COUNT(*) AS n FROM assignments WHERE experiment_id = ?', created.id);
    const conversions = count(app, 'SELECT COUNT(*) AS n FROM conversions');
    expect(assignments + conversions).toBe(EXPERIMENT_LIMITS.EVENT_LIMIT);
  });
});
