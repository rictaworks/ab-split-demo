import { assign, AssignInput } from '../../src/core/assign';
import { ASSIGN_SOURCE, EXPERIMENT_LIMITS, EXPERIMENT_STATUS } from '../../src/config/domain';
import { DomainCoreError } from '../../src/core/errors';

const PUBLIC_KEY = 'k'.repeat(32);

function baseInput(overrides: Partial<AssignInput> = {}): AssignInput {
  return {
    experiment: {
      id: 'exp-1',
      status: EXPERIMENT_STATUS.RUNNING,
      variants: [
        { id: 'A', weight: 1 },
        { id: 'B', weight: 1 },
      ],
      eventCount: 0,
    },
    publicKey: PUBLIC_KEY,
    visitorId: 'visitor-001',
    savedVariantId: null,
    ...overrides,
  };
}

describe('assign（バリアント割当）', () => {
  it('実験が存在しなければ既定表示を返し、保存しない', () => {
    const result = assign(baseInput({ experiment: null }));
    expect(result).toEqual({ variantId: null, source: ASSIGN_SOURCE.DEFAULT, persist: false });
  });

  it.each([EXPERIMENT_STATUS.DRAFT, EXPERIMENT_STATUS.PAUSED])(
    '状態が %s の実験は既定表示を返し、保存しない',
    (status) => {
      const base = baseInput();
      const result = assign(
        baseInput({ experiment: { ...base.experiment!, status } }),
      );
      expect(result).toEqual({ variantId: null, source: ASSIGN_SOURCE.DEFAULT, persist: false });
    },
  );

  it('未割当の実行中実験では、ハッシュで決まるバリアントを返し保存対象にする', () => {
    const result = assign(baseInput());
    expect(['A', 'B']).toContain(result.variantId);
    expect(result.source).toBe(ASSIGN_SOURCE.HASHED);
    expect(result.persist).toBe(true);
  });

  it('同じ公開キーと訪問者 ID には常に同じバリアントを返す（決定的）', () => {
    const first = assign(baseInput({ visitorId: 'visitor-xyz' }));
    const second = assign(baseInput({ visitorId: 'visitor-xyz' }));
    expect(second.variantId).toBe(first.variantId);
  });

  it('保存済みの割当があれば、ハッシュより優先して返し、再保存しない', () => {
    const base = baseInput();
    const hashed = assign(base);
    const other = hashed.variantId === 'A' ? 'B' : 'A';
    const result = assign(baseInput({ savedVariantId: other }));
    expect(result).toEqual({ variantId: other, source: ASSIGN_SOURCE.EXISTING, persist: false });
  });

  it('配分率 0 のバリアントは選ばれない', () => {
    const experiment = {
      id: 'exp-1',
      status: EXPERIMENT_STATUS.RUNNING,
      variants: [
        { id: 'A', weight: 1 },
        { id: 'B', weight: 0 },
        { id: 'C', weight: 1 },
      ],
      eventCount: 0,
    };
    const chosen = new Set<string | null>();
    for (let i = 0; i < 2000; i += 1) {
      chosen.add(assign(baseInput({ experiment, visitorId: `v-${i}` })).variantId);
    }
    expect(chosen.has('B')).toBe(false);
    expect(chosen.has('A')).toBe(true);
    expect(chosen.has('C')).toBe(true);
  });

  it('配分率 1:3 の割合が概ね 75% に従う', () => {
    const experiment = {
      id: 'exp-1',
      status: EXPERIMENT_STATUS.RUNNING,
      variants: [
        { id: 'A', weight: 1 },
        { id: 'B', weight: 3 },
      ],
      eventCount: 0,
    };
    let countB = 0;
    const total = 10000;
    for (let i = 0; i < total; i += 1) {
      if (assign(baseInput({ experiment, visitorId: `sample-${i}` })).variantId === 'B') {
        countB += 1;
      }
    }
    expect(countB / total).toBeGreaterThan(0.72);
    expect(countB / total).toBeLessThan(0.78);
  });

  it('イベント上限に達した実行中実験は対照を返し、保存しない', () => {
    const base = baseInput();
    const result = assign(
      baseInput({
        experiment: { ...base.experiment!, eventCount: EXPERIMENT_LIMITS.EVENT_LIMIT },
      }),
    );
    expect(result).toEqual({ variantId: 'A', source: ASSIGN_SOURCE.CAPPED, persist: false });
  });

  it('状態が capped の実験は対照を返し、保存しない', () => {
    const base = baseInput();
    const result = assign(
      baseInput({ experiment: { ...base.experiment!, status: EXPERIMENT_STATUS.CAPPED } }),
    );
    expect(result).toEqual({ variantId: 'A', source: ASSIGN_SOURCE.CAPPED, persist: false });
  });

  it('上限到達後も保存済みの割当を優先して返す（要件 3「割当は一度保存したものを常に優先する」）', () => {
    const base = baseInput();
    const result = assign(
      baseInput({
        savedVariantId: 'B',
        experiment: { ...base.experiment!, status: EXPERIMENT_STATUS.CAPPED },
      }),
    );
    expect(result).toEqual({ variantId: 'B', source: ASSIGN_SOURCE.EXISTING, persist: false });
  });

  it('イベント上限到達時も保存済みの割当を優先し、未割当の新規訪問者にだけ対照を返す', () => {
    const base = baseInput();
    const capped = { ...base.experiment!, eventCount: EXPERIMENT_LIMITS.EVENT_LIMIT };
    const saved = assign(baseInput({ experiment: capped, savedVariantId: 'B' }));
    expect(saved).toEqual({ variantId: 'B', source: ASSIGN_SOURCE.EXISTING, persist: false });
    const newcomer = assign(baseInput({ experiment: capped, savedVariantId: null }));
    expect(newcomer).toEqual({ variantId: 'A', source: ASSIGN_SOURCE.CAPPED, persist: false });
  });

  it('配分率の合計が 0 のときは明示的に例外を投げる', () => {
    const base = baseInput();
    expect(() =>
      assign(
        baseInput({
          experiment: {
            ...base.experiment!,
            variants: [
              { id: 'A', weight: 0 },
              { id: 'B', weight: 0 },
            ],
          },
        }),
      ),
    ).toThrow(DomainCoreError);
  });

  it('整数でない配分率の例外メッセージには該当バリアント ID が含まれる', () => {
    const base = baseInput();
    expect(() =>
      assign(
        baseInput({
          experiment: {
            ...base.experiment!,
            variants: [
              { id: 'A', weight: 1 },
              { id: 'B', weight: 1.5 },
            ],
          },
        }),
      ),
    ).toThrow(/B/);
  });

  it('公開キーが空なら例外を投げる', () => {
    expect(() => assign(baseInput({ publicKey: '' }))).toThrow(DomainCoreError);
  });

  it('訪問者 ID が空なら例外を投げる', () => {
    expect(() => assign(baseInput({ visitorId: '' }))).toThrow(DomainCoreError);
  });
});
