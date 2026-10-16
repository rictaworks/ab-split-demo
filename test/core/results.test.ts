import { summarizeResults, ResultsInput } from '../../src/core/results';
import { EXPERIMENT_LIMITS, EXPERIMENT_STATUS, JUDGEMENT } from '../../src/config/domain';
import { DomainCoreError } from '../../src/core/errors';

function baseInput(overrides: Partial<ResultsInput> = {}): ResultsInput {
  return {
    status: EXPERIMENT_STATUS.RUNNING,
    eventCount: 2000,
    minSample: EXPERIMENT_LIMITS.MIN_SAMPLE_DEFAULT,
    variants: [
      { id: 'A', exposures: 1000, conversions: 100 },
      { id: 'B', exposures: 1000, conversions: 130 },
    ],
    ...overrides,
  };
}

describe('summarizeResults（結果集計）', () => {
  it('バリアントごとに転換率を算出する', () => {
    const summary = summarizeResults(baseInput());
    expect(summary.variants[0]?.rate).toBeCloseTo(0.1, 12);
    expect(summary.variants[1]?.rate).toBeCloseTo(0.13, 12);
  });

  it('露出数 0 のバリアントの転換率は null（未定義）になる', () => {
    const summary = summarizeResults(
      baseInput({
        variants: [
          { id: 'A', exposures: 0, conversions: 0 },
          { id: 'B', exposures: 0, conversions: 0 },
        ],
      }),
    );
    expect(summary.variants[0]?.rate).toBeNull();
    expect(summary.variants[1]?.judgement).toBe(JUDGEMENT.INSUFFICIENT_DATA);
  });

  it('先頭バリアントを対照として扱う', () => {
    const summary = summarizeResults(baseInput());
    expect(summary.variants[0]?.judgement).toBe(JUDGEMENT.CONTROL);
    expect(summary.variants[0]?.lift).toBeNull();
    expect(summary.variants[0]?.pValue).toBeNull();
  });

  it('リフトは（対象 − 対照）÷ 対照 で算出する', () => {
    const summary = summarizeResults(baseInput());
    expect(summary.variants[1]?.lift).toBeCloseTo(0.3, 10);
  });

  it('二標本比率の z 検定による p 値を出し、有意水準未満なら有意とする', () => {
    const summary = summarizeResults(baseInput());
    expect(summary.variants[1]?.pValue).toBeCloseTo(0.0355, 3);
    expect(summary.variants[1]?.judgement).toBe(JUDGEMENT.SIGNIFICANT);
  });

  it('差が小さければ有意差なしと判定する', () => {
    const summary = summarizeResults(
      baseInput({
        variants: [
          { id: 'A', exposures: 1000, conversions: 100 },
          { id: 'B', exposures: 1000, conversions: 105 },
        ],
      }),
    );
    expect(summary.variants[1]?.pValue).toBeGreaterThan(0.05);
    expect(summary.variants[1]?.judgement).toBe(JUDGEMENT.NOT_SIGNIFICANT);
  });

  it('対照のサンプルが最小サンプル数（既定 30）未満ならデータ不足とし、リフト・p 値を出さない', () => {
    const summary = summarizeResults(
      baseInput({
        variants: [
          { id: 'A', exposures: 29, conversions: 5 },
          { id: 'B', exposures: 1000, conversions: 300 },
        ],
      }),
    );
    expect(summary.variants[1]?.judgement).toBe(JUDGEMENT.INSUFFICIENT_DATA);
    expect(summary.variants[1]?.lift).toBeNull();
    expect(summary.variants[1]?.pValue).toBeNull();
  });

  it('対象のサンプルが最小サンプル数未満ならデータ不足とする', () => {
    const summary = summarizeResults(
      baseInput({
        variants: [
          { id: 'A', exposures: 1000, conversions: 100 },
          { id: 'B', exposures: 29, conversions: 10 },
        ],
      }),
    );
    expect(summary.variants[1]?.judgement).toBe(JUDGEMENT.INSUFFICIENT_DATA);
  });

  it('最小サンプル数は入力で変えられる（ちょうど 30 は十分とみなす）', () => {
    const summary = summarizeResults(
      baseInput({
        minSample: 30,
        variants: [
          { id: 'A', exposures: 30, conversions: 3 },
          { id: 'B', exposures: 30, conversions: 15 },
        ],
      }),
    );
    expect(summary.variants[1]?.judgement).not.toBe(JUDGEMENT.INSUFFICIENT_DATA);
  });

  it('対照の転換率が 0 のときはデータ不足とする', () => {
    const summary = summarizeResults(
      baseInput({
        variants: [
          { id: 'A', exposures: 1000, conversions: 0 },
          { id: 'B', exposures: 1000, conversions: 50 },
        ],
      }),
    );
    expect(summary.variants[1]?.judgement).toBe(JUDGEMENT.INSUFFICIENT_DATA);
    expect(summary.variants[1]?.lift).toBeNull();
  });

  it('プール比率が 1 のときはデータ不足とする', () => {
    const summary = summarizeResults(
      baseInput({
        variants: [
          { id: 'A', exposures: 1000, conversions: 1000 },
          { id: 'B', exposures: 1000, conversions: 1000 },
        ],
      }),
    );
    expect(summary.variants[1]?.judgement).toBe(JUDGEMENT.INSUFFICIENT_DATA);
    expect(summary.variants[1]?.pValue).toBeNull();
  });

  it('バリアントが 1 件のみのときは比較不能とする', () => {
    const summary = summarizeResults(
      baseInput({ variants: [{ id: 'A', exposures: 1000, conversions: 100 }] }),
    );
    expect(summary.comparable).toBe(false);
    expect(summary.variants[0]?.judgement).toBe(JUDGEMENT.CONTROL);
  });

  it('2 件以上ならば比較可能とする', () => {
    expect(summarizeResults(baseInput()).comparable).toBe(true);
  });

  it('状態とイベント上限到達の有無を併せて返す', () => {
    const reached = summarizeResults(
      baseInput({ eventCount: EXPERIMENT_LIMITS.EVENT_LIMIT }),
    );
    expect(reached.eventLimitReached).toBe(true);
    expect(reached.status).toBe(EXPERIMENT_STATUS.RUNNING);

    const notReached = summarizeResults(baseInput());
    expect(notReached.eventLimitReached).toBe(false);
  });

  it('転換数が露出数を超える入力は例外を投げる', () => {
    expect(() =>
      summarizeResults(
        baseInput({ variants: [{ id: 'A', exposures: 10, conversions: 11 }] }),
      ),
    ).toThrow(DomainCoreError);
  });

  it('負の露出数は例外を投げる', () => {
    expect(() =>
      summarizeResults(
        baseInput({ variants: [{ id: 'A', exposures: -1, conversions: 0 }] }),
      ),
    ).toThrow(DomainCoreError);
  });
});
