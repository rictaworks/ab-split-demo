import { createTestApp, TestApp } from '../support/app';
import { createExperiment, experimentBody, newSession, OwnerSession, startExperiment } from '../support/fixtures';
import { SERVICE_MESSAGE } from '../../src/config/messages';
import { EXPERIMENT_LIMITS } from '../../src/config/domain';

interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string };
}

describe('管理 API /api/experiments（要件 4）', () => {
  let app: TestApp;
  let owner: OwnerSession;

  beforeEach(async () => {
    app = createTestApp();
    owner = await newSession(app);
  });

  it('Cookie が無い初回アクセスでセッションを発行し、HttpOnly の Set-Cookie を返す', async () => {
    const response = await app.send({ path: '/api/experiments' });
    expect(response.status).toBe(200);
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^ab_session=[0-9a-f]{32};/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('作成した実験は draft で、32 文字の公開キーと ID 付きのバリアントを持つ', async () => {
    const response = await app.send({
      method: 'POST',
      path: '/api/experiments',
      cookie: owner.cookie,
      json: experimentBody(),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      experiment: { status: string; publicKey: string; variants: Array<{ id: string; key: string; position: number }> };
    };
    expect(body.experiment.status).toBe('draft');
    expect(body.experiment.publicKey).toMatch(/^[0-9a-f]{32}$/);
    expect(body.experiment.variants.map((v) => [v.key, v.position])).toEqual([
      ['control', 0],
      ['variant-b', 1],
    ]);
  });

  it('公開キーは実験ごとに異なる', async () => {
    const first = await createExperiment(app, owner);
    const second = await createExperiment(app, owner);
    expect(first.publicKey).not.toBe(second.publicKey);
  });

  it('JSON 以外の Content-Type は 415 で拒否する（CSRF 対策を兼ねる）', async () => {
    const response = await app.send({
      method: 'POST',
      path: '/api/experiments',
      cookie: owner.cookie,
      rawBody: JSON.stringify(experimentBody()),
      contentType: 'text/plain',
    });
    expect(response.status).toBe(415);
  });

  it('不正な JSON は 400 で拒否する', async () => {
    const response = await app.send({
      method: 'POST',
      path: '/api/experiments',
      cookie: owner.cookie,
      rawBody: '{"name":',
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe('invalid_json');
    // 解析エラーの詳細（パーサの内部メッセージ）は応答に出さず、固定の文言にする。
    expect(body.error.message).toBe(SERVICE_MESSAGE.INVALID_JSON);
    expect(body.error.message).not.toMatch(/SyntaxError|Unexpected|position/);
  });

  it('不正な JSON の詳細は応答ではなくログにだけ残す', async () => {
    (console.error as jest.Mock).mockClear();
    await app.send({ method: 'POST', path: '/api/experiments', cookie: owner.cookie, rawBody: '{"name":' });
    const logged = (console.error as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(logged.some((line) => line.includes('http.invalid_json_detail'))).toBe(true);
  });

  it('入力検証に失敗したら 400 と検証メッセージを返し、既定値で補わない', async () => {
    const response = await app.send({
      method: 'POST',
      path: '/api/experiments',
      cookie: owner.cookie,
      json: experimentBody({ minSample: undefined }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.message).toContain('最小サンプル数');
  });

  it('ハニーポット項目に値があれば 400 で拒否する', async () => {
    const response = await app.send({
      method: 'POST',
      path: '/api/experiments',
      cookie: owner.cookie,
      json: experimentBody({ website: 'http://spam.example' }),
    });
    expect(response.status).toBe(400);
  });

  it('1 セッションの実験数は 5 件までで、6 件目は明示的なエラーで拒否する', async () => {
    expect(EXPERIMENT_LIMITS.MAX_EXPERIMENTS_PER_SESSION).toBe(5);
    for (let i = 0; i < 5; i += 1) {
      await createExperiment(app, owner);
    }
    const response = await app.send({
      method: 'POST',
      path: '/api/experiments',
      cookie: owner.cookie,
      json: experimentBody(),
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe('experiment_limit_reached');
  });

  it('一覧は自分のセッションの実験だけを返す', async () => {
    const mine = await createExperiment(app, owner);
    const other = await newSession(app);
    await createExperiment(app, other);
    const response = await app.send({ path: '/api/experiments', cookie: owner.cookie });
    const body = (await response.json()) as { experiments: Array<{ id: string }> };
    expect(body.experiments.map((e) => e.id)).toEqual([mine.id]);
  });

  it('他セッションの実験は参照・編集・状態変更・模擬・結果のいずれも 404 で拒否する', async () => {
    const target = await createExperiment(app, owner);
    const intruder = await newSession(app);
    const requests: Array<{ method: string; path: string; json?: unknown }> = [
      { method: 'GET', path: `/api/experiments/${target.id}` },
      { method: 'PUT', path: `/api/experiments/${target.id}`, json: experimentBody() },
      { method: 'POST', path: `/api/experiments/${target.id}/status`, json: { to: 'running' } },
      { method: 'POST', path: `/api/experiments/${target.id}/simulate`, json: { visitorCount: 1, conversionRates: {} } },
      { method: 'GET', path: `/api/experiments/${target.id}/results` },
    ];
    for (const request of requests) {
      const response = await app.send({ ...request, cookie: intruder.cookie });
      expect([request.path, response.status]).toEqual([request.path, 404]);
    }
  });

  it('存在しない ID と他人の ID は同じ 404 応答になる（存在を推測させない）', async () => {
    const target = await createExperiment(app, owner);
    const intruder = await newSession(app);
    const foreign = await app.send({ path: `/api/experiments/${target.id}`, cookie: intruder.cookie });
    const missing = await app.send({ path: '/api/experiments/00000000-0000-0000-0000-000000000000', cookie: intruder.cookie });
    expect(await foreign.text()).toBe(await missing.text());
  });

  it('draft → running は配分率の合計が 0 だと 409 で拒否する', async () => {
    const created = await createExperiment(app, owner, {
      variants: [
        { key: 'control', label: '対照', weight: 0 },
        { key: 'variant-b', label: '案B', weight: 0 },
      ],
    });
    const response = await app.send({
      method: 'POST',
      path: `/api/experiments/${created.id}/status`,
      cookie: owner.cookie,
      json: { to: 'running' },
    });
    expect(response.status).toBe(409);
  });

  it('draft → running の後に running → paused → running と遷移でき、draft へは戻せない', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    const pause = await app.send({
      method: 'POST',
      path: `/api/experiments/${created.id}/status`,
      cookie: owner.cookie,
      json: { to: 'paused' },
    });
    expect(pause.status).toBe(200);
    const resume = await app.send({
      method: 'POST',
      path: `/api/experiments/${created.id}/status`,
      cookie: owner.cookie,
      json: { to: 'running' },
    });
    expect(resume.status).toBe(200);
    const restore = await app.send({
      method: 'POST',
      path: `/api/experiments/${created.id}/status`,
      cookie: owner.cookie,
      json: { to: 'draft' },
    });
    expect(restore.status).toBe(400);
  });

  it('capped への手動遷移は指定できない（自動遷移のみ）', async () => {
    const created = await createExperiment(app, owner);
    const response = await app.send({
      method: 'POST',
      path: `/api/experiments/${created.id}/status`,
      cookie: owner.cookie,
      json: { to: 'capped' },
    });
    expect(response.status).toBe(400);
  });

  it('実行中の実験はバリアントの件数や公開キーに関わる項目を変更できない（件数変更は 409）', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    const response = await app.send({
      method: 'PUT',
      path: `/api/experiments/${created.id}`,
      cookie: owner.cookie,
      json: experimentBody({
        variants: [
          { key: 'control', label: '対照', weight: 1 },
          { key: 'variant-b', label: '案B', weight: 1 },
          { key: 'variant-c', label: '案C', weight: 1 },
        ],
      }),
    });
    expect(response.status).toBe(409);
  });

  it('実行中の実験では配分率の変更を受け付け、合計 0 にはできない', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    const ok = await app.send({
      method: 'PUT',
      path: `/api/experiments/${created.id}`,
      cookie: owner.cookie,
      json: experimentBody({
        variants: [
          { key: 'control', label: '対照', weight: 1 },
          { key: 'variant-b', label: '案B', weight: 3 },
        ],
      }),
    });
    expect(ok.status).toBe(200);
    const zero = await app.send({
      method: 'PUT',
      path: `/api/experiments/${created.id}`,
      cookie: owner.cookie,
      json: experimentBody({
        variants: [
          { key: 'control', label: '対照', weight: 0 },
          { key: 'variant-b', label: '案B', weight: 0 },
        ],
      }),
    });
    expect(zero.status).toBe(409);
  });

  it('draft の模擬トラフィックは 409 で拒否し、実行中は件数と転換を記録する', async () => {
    const created = await createExperiment(app, owner);
    const rates = Object.fromEntries(created.variantIds.map((id) => [id, 0.5]));
    const draft = await app.send({
      method: 'POST',
      path: `/api/experiments/${created.id}/simulate`,
      cookie: owner.cookie,
      json: { visitorCount: 50, conversionRates: rates },
    });
    expect(draft.status).toBe(409);

    await startExperiment(app, owner, created.id);
    const run = await app.send({
      method: 'POST',
      path: `/api/experiments/${created.id}/simulate`,
      cookie: owner.cookie,
      json: { visitorCount: 200, conversionRates: rates },
    });
    expect(run.status).toBe(200);
    const body = (await run.json()) as { processedVisitors: number; conversions: number; stoppedByLimit: boolean };
    expect(body.processedVisitors).toBe(200);
    expect(body.conversions).toBeGreaterThan(0);
    expect(body.stoppedByLimit).toBe(false);
  });

  it('模擬の訪問者数が上限を超えると 400 で拒否する', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    const response = await app.send({
      method: 'POST',
      path: `/api/experiments/${created.id}/simulate`,
      cookie: owner.cookie,
      json: { visitorCount: 1001, conversionRates: {} },
    });
    expect(response.status).toBe(400);
  });

  it('結果 API は露出数・転換数・転換率・判定を返し、データ不足の間はリフトを出さない', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    const response = await app.send({
      path: `/api/experiments/${created.id}/results`,
      cookie: owner.cookie,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      comparable: boolean;
      variants: Array<{ exposures: number; lift: number | null; judgement: string }>;
    };
    expect(body.comparable).toBe(true);
    expect(body.variants[1]!.lift).toBeNull();
    expect(body.variants[1]!.judgement).toBe('insufficient_data');
  });
});
