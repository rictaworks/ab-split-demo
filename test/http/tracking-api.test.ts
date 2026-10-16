import { createTestApp, TestApp } from '../support/app';
import { createExperiment, newSession, OwnerSession, startExperiment } from '../support/fixtures';
import { EXPERIMENT_LIMITS } from '../../src/config/domain';

describe('計測 API（要件 5）', () => {
  let app: TestApp;
  let owner: OwnerSession;

  beforeEach(async () => {
    app = createTestApp();
    owner = await newSession(app);
  });

  it('GET assign は全オリジンを許可し、Cookie を発行も参照もしない', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    const response = await app.send({
      path: `/t/${created.publicKey}/assign?visitor_id=visitor-1`,
      headers: { origin: 'https://customer.example', cookie: 'ab_session=' + 'f'.repeat(32) },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('同じ訪問者には常に同じバリアントを返し、2 回目は保存済みとして扱う', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    const first = await (await app.send({ path: `/t/${created.publicKey}/assign?visitor_id=v-42` })).json();
    const second = await (await app.send({ path: `/t/${created.publicKey}/assign?visitor_id=v-42` })).json();
    expect(second).toEqual(first);
    const row = app.raw.prepare('SELECT COUNT(*) AS n FROM assignments').get() as { n: number };
    expect(row.n).toBe(1);
  });

  it('割当の応答はバリアントのキー・表示内容・ゴール名を含む', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    const body = (await (await app.send({ path: `/t/${created.publicKey}/assign?visitor_id=v-1` })).json()) as {
      variant: { key: string; payload: Record<string, unknown> } | null;
      goalName: string | null;
    };
    expect(['control', 'variant-b']).toContain(body.variant?.key);
    expect(body.variant?.payload).toEqual(expect.any(Object));
    expect(body.goalName).toBe('purchase');
  });

  it('形式が不正な公開キーや訪問者 ID は 400 で拒否する', async () => {
    expect((await app.send({ path: '/t/not-a-key/assign?visitor_id=v-1' })).status).toBe(400);
    const created = await createExperiment(app, owner);
    expect((await app.send({ path: `/t/${created.publicKey}/assign` })).status).toBe(400);
    expect((await app.send({ path: `/t/${created.publicKey}/assign?visitor_id=a%20b` })).status).toBe(400);
  });

  it('存在しない公開キーと draft の実験は既定表示（variant は null）を返す', async () => {
    const created = await createExperiment(app, owner);
    const draft = await (await app.send({ path: `/t/${created.publicKey}/assign?visitor_id=v-1` })).json();
    expect(draft).toEqual({ variant: null, goalName: null });
    const unknown = await (await app.send({ path: `/t/${'0'.repeat(32)}/assign?visitor_id=v-1` })).json();
    expect(unknown).toEqual({ variant: null, goalName: null });
  });

  it('convert は成功時に ok: true、同じゴールの重複は ok: false を返し、Cookie を使わない', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    await app.send({ path: `/t/${created.publicKey}/assign?visitor_id=v-7` });
    const post = (): Promise<Response> =>
      app.send({
        method: 'POST',
        path: `/t/${created.publicKey}/convert`,
        json: { visitorId: 'v-7', goalName: 'purchase' },
        headers: { origin: 'https://customer.example' },
      });
    const first = await post();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    expect(first.headers.get('set-cookie')).toBeNull();
    expect(first.headers.get('access-control-allow-origin')).toBe('*');
    expect(await (await post()).json()).toEqual({ ok: false });
  });

  it('割当が無い訪問者・別ゴール・存在しない実験の convert は記録せず ok: false を返す', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    const noAssignment = await app.send({
      method: 'POST',
      path: `/t/${created.publicKey}/convert`,
      json: { visitorId: 'nobody', goalName: 'purchase' },
    });
    expect(await noAssignment.json()).toEqual({ ok: false });
    await app.send({ path: `/t/${created.publicKey}/assign?visitor_id=v-8` });
    const otherGoal = await app.send({
      method: 'POST',
      path: `/t/${created.publicKey}/convert`,
      json: { visitorId: 'v-8', goalName: 'signup' },
    });
    expect(await otherGoal.json()).toEqual({ ok: false });
    const unknown = await app.send({
      method: 'POST',
      path: `/t/${'0'.repeat(32)}/convert`,
      json: { visitorId: 'v-8', goalName: 'purchase' },
    });
    expect(await unknown.json()).toEqual({ ok: false });
  });

  it('convert の本文が不正なら 400 で拒否する', async () => {
    const created = await createExperiment(app, owner);
    const response = await app.send({
      method: 'POST',
      path: `/t/${created.publicKey}/convert`,
      json: { visitorId: '', goalName: 'purchase' },
    });
    expect(response.status).toBe(400);
  });

  it('OPTIONS は CORS の事前応答を返す', async () => {
    const created = await createExperiment(app, owner);
    const response = await app.send({ method: 'OPTIONS', path: `/t/${created.publicKey}/convert` });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('上限到達後は割当を対照に固定し、新規訪問者を保存せず、転換も記録しない', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    const savedBefore = await (await app.send({ path: `/t/${created.publicKey}/assign?visitor_id=early` })).json();
    seedAssignments(app, created.id, EXPERIMENT_LIMITS.EVENT_LIMIT - 1);
    await app.send({ path: `/t/${created.publicKey}/assign?visitor_id=last` });

    const status = app.raw.prepare('SELECT status FROM experiments WHERE id = ?').get(created.id) as { status: string };
    expect(status.status).toBe('capped');

    const newcomer = (await (await app.send({ path: `/t/${created.publicKey}/assign?visitor_id=late` })).json()) as {
      variant: { key: string };
    };
    expect(newcomer.variant.key).toBe('control');
    const stored = app.raw.prepare("SELECT COUNT(*) AS n FROM assignments WHERE visitor_id = 'late'").get() as { n: number };
    expect(stored.n).toBe(0);

    const early = await (await app.send({ path: `/t/${created.publicKey}/assign?visitor_id=early` })).json();
    expect(early).toEqual(savedBefore);

    const converted = await app.send({
      method: 'POST',
      path: `/t/${created.publicKey}/convert`,
      json: { visitorId: 'early', goalName: 'purchase' },
    });
    expect(await converted.json()).toEqual({ ok: false });
  });

  it('イベント上限の定数は 10,000 件である', () => {
    expect(EXPERIMENT_LIMITS.EVENT_LIMIT).toBe(10000);
  });
});

/** 上限到達の検証用に、同一実験へ割当を直接投入する（テストのみ）。 */
function seedAssignments(app: TestApp, experimentId: string, count: number): void {
  const variant = app.raw
    .prepare("SELECT id FROM variants WHERE experiment_id = ? AND position = 0")
    .get(experimentId) as { id: string };
  app.raw.exec('BEGIN');
  const insert = app.raw.prepare(
    'INSERT INTO assignments (id, experiment_id, owner_session_id, visitor_id, variant_id, assigned_at) ' +
      'SELECT ?, id, owner_session_id, ?, ?, ? FROM experiments WHERE id = ?',
  );
  for (let i = 0; i < count; i += 1) {
    insert.run(`seed-${i}`, `seed-visitor-${i}`, variant.id, '2026-10-17T00:00:00.000Z', experimentId);
  }
  app.raw.exec('COMMIT');
}
