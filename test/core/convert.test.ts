import { convert, ConvertInput } from '../../src/core/convert';
import { CONVERT_REASON, EXPERIMENT_LIMITS, EXPERIMENT_STATUS } from '../../src/config/domain';
import { DomainCoreError } from '../../src/core/errors';

function baseInput(overrides: Partial<ConvertInput> = {}): ConvertInput {
  return {
    experiment: { id: 'exp-1', status: EXPERIMENT_STATUS.RUNNING, eventCount: 10 },
    assignment: { id: 'asg-1', variantId: 'A' },
    goalName: 'purchase',
    recordedGoals: [],
    ...overrides,
  };
}

describe('convert（転換記録）', () => {
  it('実験が存在しなければ記録しない', () => {
    expect(convert(baseInput({ experiment: null }))).toEqual({
      record: false,
      reason: CONVERT_REASON.NOT_FOUND,
    });
  });

  it.each([EXPERIMENT_STATUS.DRAFT, EXPERIMENT_STATUS.PAUSED])(
    '状態が %s の実験では記録しない',
    (status) => {
      expect(
        convert(baseInput({ experiment: { id: 'exp-1', status, eventCount: 10 } })),
      ).toEqual({ record: false, reason: CONVERT_REASON.NOT_RUNNING });
    },
  );

  it('未割当の訪問者の転換は記録しない（露出のない転換は記録しない）', () => {
    expect(convert(baseInput({ assignment: null }))).toEqual({
      record: false,
      reason: CONVERT_REASON.NO_ASSIGNMENT,
    });
  });

  it('割当済みで未記録のゴールは記録する', () => {
    expect(convert(baseInput())).toEqual({ record: true, reason: CONVERT_REASON.RECORDED });
  });

  it('同じ（割当, ゴール）の重複は記録しない', () => {
    expect(convert(baseInput({ recordedGoals: ['purchase'] }))).toEqual({
      record: false,
      reason: CONVERT_REASON.DUPLICATE,
    });
  });

  it('別のゴール名は記録対象になる', () => {
    expect(convert(baseInput({ recordedGoals: ['signup'] }))).toEqual({
      record: true,
      reason: CONVERT_REASON.RECORDED,
    });
  });

  it('状態が capped の実験では記録しない', () => {
    expect(
      convert(
        baseInput({
          experiment: { id: 'exp-1', status: EXPERIMENT_STATUS.CAPPED, eventCount: 10 },
        }),
      ),
    ).toEqual({ record: false, reason: CONVERT_REASON.CAPPED });
  });

  it('イベント上限に達した実行中実験では記録しない', () => {
    expect(
      convert(
        baseInput({
          experiment: {
            id: 'exp-1',
            status: EXPERIMENT_STATUS.RUNNING,
            eventCount: EXPERIMENT_LIMITS.EVENT_LIMIT,
          },
        }),
      ),
    ).toEqual({ record: false, reason: CONVERT_REASON.CAPPED });
  });

  it('ゴール名が空なら例外を投げる', () => {
    expect(() => convert(baseInput({ goalName: '' }))).toThrow(DomainCoreError);
  });
});
