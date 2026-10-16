import { createTestApp, TestApp } from '../support/app';
import { createExperiment, newSession, OwnerSession } from '../support/fixtures';
import { SQL } from '../../src/config/sql';
import { ExperimentRepository } from '../../src/infra/repository';

describe('UPDATE 文は所有者条件を持つ（多層防御）', () => {
  it.each([
    ['EXPERIMENT_UPDATE_FIELDS', SQL.EXPERIMENT_UPDATE_FIELDS],
    ['VARIANT_UPDATE', SQL.VARIANT_UPDATE],
    ['EXPERIMENT_SET_STATUS', SQL.EXPERIMENT_SET_STATUS],
  ])('%s に owner_session_id の条件がある', (_name, sql) => {
    expect(sql).toContain('owner_session_id = ?');
  });

  describe('リポジトリ', () => {
    let app: TestApp;
    let owner: OwnerSession;
    let repo: ExperimentRepository;

    beforeEach(async () => {
      app = createTestApp();
      owner = await newSession(app);
      repo = new ExperimentRepository(app.deps.db);
    });

    it('他人の所有者キーでは、実験とバリアントを更新できない', async () => {
      const created = await createExperiment(app, owner);
      const own = await repo.findOwned(created.id, owner.cookie.split('=')[1]!);
      expect(own).not.toBeNull();
      const forged = { ...own!.experiment, ownerSessionId: 'f'.repeat(32) };
      await repo.updateExperiment(
        forged,
        { name: '乗っ取り', goalName: 'x', minSample: 1 },
        own!.variants.map((v) => ({ id: v.id, key: 'hijack-' + v.position, label: 'x', weight: 9, payload: {} })),
      );
      const after = await repo.findOwned(created.id, owner.cookie.split('=')[1]!);
      expect(after!.experiment.name).toBe(own!.experiment.name);
      expect(after!.variants.map((v) => v.key)).toEqual(own!.variants.map((v) => v.key));
    });

    it('他人の所有者キーでは、状態を変更できない（false を返す）', async () => {
      const created = await createExperiment(app, owner);
      const updated = await repo.setStatusIfCurrent(created.id, 'f'.repeat(32), 'draft', 'running');
      expect(updated).toBe(false);
      const row = app.raw.prepare('SELECT status FROM experiments WHERE id = ?').get(created.id) as { status: string };
      expect(row.status).toBe('draft');
    });

    it('正しい所有者キーでは更新できる', async () => {
      const created = await createExperiment(app, owner);
      const ownerId = owner.cookie.split('=')[1]!;
      expect(await repo.setStatusIfCurrent(created.id, ownerId, 'draft', 'running')).toBe(true);
    });
  });
});
