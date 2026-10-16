import { simulate, SimulateInput } from '../../src/core/simulate';
import { EXPERIMENT_STATUS } from '../../src/config/domain';
import { DomainCoreError } from '../../src/core/errors';

/** 再現可能な擬似乱数（線形合同法）。テストの決定性のために使う。 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const PUBLIC_KEY = 'p'.repeat(32);

function baseInput(overrides: Partial<SimulateInput> = {}): SimulateInput {
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
    goalName: 'purchase',
    visitorCount: 200,
    conversionRates: { A: 0.5, B: 0.5 },
    random: seededRandom(42),
    ...overrides,
  };
}

describe('simulate（トラフィック模擬）', () => {
  it('指定件数の訪問者を処理し、割当件数と処理件数が一致する', () => {
    const result = simulate(baseInput({ visitorCount: 200 }));
    expect(result.processedVisitors).toBe(200);
    expect(result.assignments).toHaveLength(200);
    expect(result.stoppedByLimit).toBe(false);
  });

  it('生成された訪問者 ID は重複しない', () => {
    const result = simulate(baseInput({ visitorCount: 500 }));
    const ids = new Set(result.assignments.map((a) => a.visitorId));
    expect(ids.size).toBe(500);
  });

  it('想定転換率 1 のバリアントは全員転換し、0 のバリアントは転換しない', () => {
    const result = simulate(
      baseInput({ visitorCount: 300, conversionRates: { A: 1, B: 0 } }),
    );
    const convertedVariants = new Set(result.conversions.map((c) => c.variantId));
    expect(convertedVariants).toEqual(new Set(['A']));
    const countA = result.assignments.filter((a) => a.variantId === 'A').length;
    expect(result.conversions).toHaveLength(countA);
  });

  it('転換の記録には実験のゴール名が入る', () => {
    const result = simulate(baseInput({ visitorCount: 50, conversionRates: { A: 1, B: 1 } }));
    expect(result.conversions.every((c) => c.goalName === 'purchase')).toBe(true);
  });

  it('イベント上限に達した時点で打ち切り、stoppedByLimit を true にする', () => {
    const result = simulate(
      baseInput({
        visitorCount: 100,
        conversionRates: { A: 1, B: 1 },
        experiment: {
          id: 'exp-1',
          status: EXPERIMENT_STATUS.RUNNING,
          variants: [
            { id: 'A', weight: 1 },
            { id: 'B', weight: 1 },
          ],
          eventCount: 9990,
        },
      }),
    );
    // 1 訪問者あたり割当と転換の 2 イベント。9990 → 10000 まで 5 訪問者で到達する。
    expect(result.processedVisitors).toBe(5);
    expect(result.stoppedByLimit).toBe(true);
  });

  it('実行中でない実験は例外を投げる', () => {
    const base = baseInput();
    expect(() =>
      simulate(
        baseInput({
          experiment: { ...base.experiment, status: EXPERIMENT_STATUS.DRAFT },
        }),
      ),
    ).toThrow(DomainCoreError);
  });

  it('想定転換率が不足しているバリアントがあれば例外を投げる', () => {
    expect(() => simulate(baseInput({ conversionRates: { A: 0.5 } }))).toThrow(
      DomainCoreError,
    );
  });

  it('想定転換率が 0 から 1 の範囲外なら例外を投げる', () => {
    expect(() =>
      simulate(baseInput({ conversionRates: { A: 1.5, B: 0.5 } })),
    ).toThrow(DomainCoreError);
  });

  it('訪問者数が 0 以下なら例外を投げる', () => {
    expect(() => simulate(baseInput({ visitorCount: 0 }))).toThrow(DomainCoreError);
  });
});
