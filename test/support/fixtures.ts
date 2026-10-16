import { TestApp, sessionCookieOf } from './app';

export function experimentBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: '見出しの検証',
    goalName: 'purchase',
    minSample: 30,
    variants: [
      { key: 'control', label: '対照', weight: 1, payload: { selector: '#cta', text: '申し込む', color: '#1d4ed8' } },
      { key: 'variant-b', label: '案B', weight: 1, payload: { selector: '#cta', text: '今すぐ申し込む' } },
    ],
    ...overrides,
  };
}

export interface OwnerSession {
  readonly cookie: string;
}

/** 新しいセッションを発行して Cookie を返す（応答の Set-Cookie から取り出す）。 */
export async function newSession(app: TestApp): Promise<OwnerSession> {
  const response = await app.send({ path: '/api/experiments' });
  return { cookie: sessionCookieOf(response) };
}

/** 実験を作成し、ID と公開キーを返す。 */
export async function createExperiment(
  app: TestApp,
  session: OwnerSession,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; publicKey: string; variantIds: string[] }> {
  const response = await app.send({
    method: 'POST',
    path: '/api/experiments',
    cookie: session.cookie,
    json: experimentBody(overrides),
  });
  if (response.status !== 201) {
    throw new Error(`実験の作成に失敗しました（status: ${response.status}）。`);
  }
  const body = (await response.json()) as {
    experiment: { id: string; publicKey: string; variants: Array<{ id: string }> };
  };
  return {
    id: body.experiment.id,
    publicKey: body.experiment.publicKey,
    variantIds: body.experiment.variants.map((variant) => variant.id),
  };
}

/** 実験を実行中にする。 */
export async function startExperiment(app: TestApp, session: OwnerSession, id: string): Promise<void> {
  const response = await app.send({
    method: 'POST',
    path: `/api/experiments/${id}/status`,
    cookie: session.cookie,
    json: { to: 'running' },
  });
  if (response.status !== 200) {
    throw new Error(`実験の開始に失敗しました（status: ${response.status}）。`);
  }
}
