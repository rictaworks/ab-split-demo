import { createTestApp, TestApp } from '../support/app';
import { createExperiment, newSession, OwnerSession } from '../support/fixtures';
import { fingerprintSecret } from '../../src/core/fingerprint';

describe('ログにセッション ID（トークン相当）を平文で出さない', () => {
  let app: TestApp;
  let owner: OwnerSession;
  let sessionId: string;

  beforeEach(async () => {
    app = createTestApp();
    owner = await newSession(app);
    sessionId = owner.cookie.split('=')[1]!;
    (console.log as jest.Mock).mockClear();
    (console.error as jest.Mock).mockClear();
  });

  function allLogs(): string {
    return [...(console.log as jest.Mock).mock.calls, ...(console.error as jest.Mock).mock.calls]
      .map((call) => String(call[0]))
      .join('\n');
  }

  it('作成・更新・未検出・上限到達のログに平文のセッション ID が無く、ハッシュが入る', async () => {
    const created = await createExperiment(app, owner);
    await app.send({ path: `/api/experiments/${'0'.repeat(8)}`, cookie: owner.cookie });
    await app.send({
      method: 'PUT',
      path: `/api/experiments/${created.id}`,
      cookie: owner.cookie,
      json: {
        name: '更新',
        goalName: 'purchase',
        minSample: 30,
        variants: [
          { key: 'control', label: '対照', weight: 1, payload: {} },
          { key: 'variant-b', label: '案B', weight: 1, payload: {} },
        ],
      },
    });
    for (let i = 0; i < 5; i += 1) {
      await createExperiment(app, owner).catch(() => undefined);
    }
    const logs = allLogs();
    expect(logs).toContain('experiment.created');
    expect(logs).toContain('experiment.not_found');
    expect(logs).toContain('experiment.limit_reached');
    expect(logs).not.toContain(sessionId);
    expect(logs).toContain(await fingerprintSecret(sessionId));
  });
});
