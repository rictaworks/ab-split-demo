import { createTestApp, TestApp, TEST_DEMO_LIST_URL } from '../support/app';
import { createExperiment, experimentBody, newSession, OwnerSession, startExperiment } from '../support/fixtures';
import { SERVICE_MESSAGE } from '../../src/config/messages';
import { UI_TEXT } from '../../src/config/ui';
import { INPUT_RULES } from '../../src/config/domain';

async function put(app: TestApp, owner: OwnerSession, id: string, body: unknown): Promise<Response> {
  return app.send({ method: 'PUT', path: `/api/experiments/${id}`, cookie: owner.cookie, json: body });
}

describe('要修正 1: draft 以外では goalName を変更できない', () => {
  let app: TestApp;
  let owner: OwnerSession;

  beforeEach(async () => {
    app = createTestApp();
    owner = await newSession(app);
  });

  it('実行中の goalName 変更は 409 で拒否し、値も転換数も変わらない', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    await app.send({ path: `/t/${created.publicKey}/assign?visitor_id=v-1` });
    await app.send({ method: 'POST', path: `/t/${created.publicKey}/convert`, json: { visitorId: 'v-1', goalName: 'purchase' } });

    const response = await put(app, owner, created.id, experimentBody({ goalName: 'signup' }));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe(SERVICE_MESSAGE.GOAL_NAME_LOCKED);

    const detail = await app.send({ path: `/api/experiments/${created.id}`, cookie: owner.cookie });
    const { experiment } = (await detail.json()) as { experiment: { goalName: string } };
    expect(experiment.goalName).toBe('purchase');
    const results = await app.send({ path: `/api/experiments/${created.id}/results`, cookie: owner.cookie });
    const summary = (await results.json()) as { variants: Array<{ conversions: number }> };
    expect(summary.variants.reduce((sum, variant) => sum + variant.conversions, 0)).toBe(1);
  });

  it('停止中の goalName 変更も 409 で拒否する', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    await app.send({ method: 'POST', path: `/api/experiments/${created.id}/status`, cookie: owner.cookie, json: { to: 'paused' } });
    const response = await put(app, owner, created.id, experimentBody({ goalName: 'signup' }));
    expect(response.status).toBe(409);
  });

  it('実行中でも同じ goalName を再送する更新は受け付ける', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    const response = await put(app, owner, created.id, experimentBody({ goalName: 'purchase', name: '改名' }));
    expect(response.status).toBe(200);
  });

  it('draft の間は goalName を変更できる', async () => {
    const created = await createExperiment(app, owner);
    const response = await put(app, owner, created.id, experimentBody({ goalName: 'signup' }));
    expect(response.status).toBe(200);
  });

  it('編集画面では draft 以外のゴール名の入力欄を読み取り専用にする', async () => {
    const created = await createExperiment(app, owner);
    await startExperiment(app, owner, created.id);
    const html = await (await app.send({ path: `/experiments/${created.id}`, cookie: owner.cookie })).text();
    expect(html).toMatch(/name="goalName"[^>]*readonly/);
  });
});

describe('要修正 2: 作成画面でバリアントを 2〜4 件作れる', () => {
  let app: TestApp;
  let owner: OwnerSession;

  beforeEach(async () => {
    app = createTestApp();
    owner = await newSession(app);
  });

  it('作成フォームに追加・削除の操作と、連番の差し込み用テンプレートがある', async () => {
    const html = await (await app.send({ path: '/', cookie: owner.cookie })).text();
    expect(html).toContain('data-variant-add>');
    expect(html).toContain(UI_TEXT.index.addVariant);
    expect((html.match(/data-variant-remove>/g) ?? []).length).toBe(3);
    expect(html).toContain('data-variant-list');
    expect(html).toContain('data-min-variants="2"');
    expect(html).toContain('data-max-variants="4"');
    expect(html).toContain('<template data-variant-template>');
    expect(html).toContain('name="v__INDEX__.key"');
    expect(html).toContain('name="v1.key"');
    expect(html).not.toContain('name="v2.key"');
    expect(html).not.toMatch(/\sonclick=/);
  });

  it('4 件のバリアントを持つ実験の画面は 4 件分の入力欄を描画し、追加・削除は出さない', async () => {
    const created = await createExperiment(app, owner, {
      variants: [0, 1, 2, 3].map((i) => ({ key: `k${i}`, label: `案${i}`, weight: 1 })),
    });
    const html = await (await app.send({ path: `/experiments/${created.id}`, cookie: owner.cookie })).text();
    for (const i of [0, 1, 2, 3]) {
      expect(html).toContain(`name="v${i}.key"`);
    }
    expect(html).not.toContain('data-variant-add>');
  });

  it('API は 1 件と 5 件を 400 で拒否し、4 件は受け付ける', async () => {
    const make = (n: number): unknown[] => Array.from({ length: n }, (_u, i) => ({ key: `k${i}`, label: `案${i}`, weight: 1 }));
    for (const n of [1, EXPERIMENT_LIMITS_MAX + 1]) {
      const response = await app.send({ method: 'POST', path: '/api/experiments', cookie: owner.cookie, json: experimentBody({ variants: make(n) }) });
      expect([n, response.status]).toEqual([n, 400]);
    }
    const ok = await app.send({ method: 'POST', path: '/api/experiments', cookie: owner.cookie, json: experimentBody({ variants: make(4) }) });
    expect(ok.status).toBe(201);
  });
});

const EXPERIMENT_LIMITS_MAX = INPUT_RULES.VARIANT_MAX_COUNT;

describe('要修正 3: 戻るリンクは DEMO_LIST_URL の値に向く', () => {
  it('全画面の「← デモ一覧へ」の href が DEMO_LIST_URL である', async () => {
    const app = createTestApp();
    const owner = await newSession(app);
    const created = await createExperiment(app, owner);
    for (const path of ['/', '/legal', '/no-such-page', `/experiments/${created.id}`]) {
      const html = await (await app.send({ path, cookie: owner.cookie })).text();
      expect([path, html.includes(`href="${TEST_DEMO_LIST_URL}">${UI_TEXT.backLink.label}`)]).toEqual([path, true]);
    }
  });

  it('404（他人の実験）の戻るリンクも DEMO_LIST_URL に向く', async () => {
    const app = createTestApp();
    const owner = await newSession(app);
    const intruder = await newSession(app);
    const created = await createExperiment(app, owner);
    const html = await (await app.send({ path: `/experiments/${created.id}`, cookie: intruder.cookie })).text();
    expect(html).not.toContain(`href="/">${UI_TEXT.backLink.label}`);
    expect(html.match(new RegExp(`href="${TEST_DEMO_LIST_URL}"`, 'g'))?.length).toBeGreaterThanOrEqual(2);
  });

  it.each([null, '', 'not a url', 'javascript:alert(1)', 'ftp://example.test/', '/relative'])(
    'DEMO_LIST_URL が %p のときは、画面を明示的に 500 で失敗させる',
    async (value) => {
      const app = createTestApp({ demoListUrl: value });
      const response = await app.send({ path: '/legal' });
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('configuration_error');
      expect(body.error.message).toContain('DEMO_LIST_URL');
    },
  );

  it('値の引用符は HTML に出ない（属性を壊せない）', async () => {
    const app = createTestApp({ demoListUrl: 'https://example.test/?a="b"' });
    const response = await app.send({ path: '/legal' });
    if (response.status === 200) {
      expect(await response.text()).not.toContain('a="b"');
    } else {
      expect(response.status).toBe(500);
    }
  });
});

describe('要修正 5: 画面に模擬の成功メッセージを渡す', () => {
  it('画面は処理件数・打ち切りの文言を data-messages に含める', async () => {
    const app = createTestApp();
    const owner = await newSession(app);
    const html = await (await app.send({ path: '/', cookie: owner.cookie })).text();
    const decode = (text: string): string => text.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    const messages = decode(/data-messages="([^"]*)"/.exec(html)![1]!);
    const parsed = JSON.parse(messages) as Record<string, string>;
    expect(parsed['simulatedSummary']).toBe(UI_TEXT.client.simulatedSummary);
    expect(parsed['simulatedStopped']).toBe(UI_TEXT.client.simulatedStopped);
    expect(UI_TEXT.client.simulatedSummary).toContain('{processed}');
  });
});
