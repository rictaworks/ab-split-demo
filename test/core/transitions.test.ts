import {
  decideTransition,
  requireTransition,
  TransitionInput,
} from '../../src/core/transitions';
import { EXPERIMENT_LIMITS, EXPERIMENT_STATUS, TRANSITION_REASON } from '../../src/config/domain';
import { DomainCoreError } from '../../src/core/errors';

function input(overrides: Partial<TransitionInput>): TransitionInput {
  return {
    experimentId: 'exp-1',
    from: EXPERIMENT_STATUS.DRAFT,
    to: EXPERIMENT_STATUS.RUNNING,
    totalWeight: 2,
    variantCount: 2,
    eventCount: 0,
    ...overrides,
  };
}

describe('状態遷移（要件 6）', () => {
  it('draft → running は配分率合計 > 0 かつバリアント 2 件以上で許可する', () => {
    expect(decideTransition(input({}))).toEqual({ allowed: true, reason: TRANSITION_REASON.ALLOWED });
  });

  it('draft → running は配分率合計が 0 なら拒否する', () => {
    expect(decideTransition(input({ totalWeight: 0 }))).toEqual({
      allowed: false,
      reason: TRANSITION_REASON.WEIGHT_NOT_POSITIVE,
    });
  });

  it('draft → running はバリアントが 1 件以下なら拒否する', () => {
    expect(decideTransition(input({ variantCount: 1 }))).toEqual({
      allowed: false,
      reason: TRANSITION_REASON.VARIANT_COUNT_TOO_FEW,
    });
  });

  it.each([
    [EXPERIMENT_STATUS.RUNNING, EXPERIMENT_STATUS.PAUSED],
    [EXPERIMENT_STATUS.PAUSED, EXPERIMENT_STATUS.RUNNING],
    [EXPERIMENT_STATUS.CAPPED, EXPERIMENT_STATUS.PAUSED],
  ])('%s → %s は許可する', (from, to) => {
    expect(
      decideTransition(input({ from, to, eventCount: EXPERIMENT_LIMITS.EVENT_LIMIT })).allowed,
    ).toBe(true);
  });

  it('running → capped はイベント数が上限に達しているときだけ許可する', () => {
    expect(
      decideTransition(
        input({ from: EXPERIMENT_STATUS.RUNNING, to: EXPERIMENT_STATUS.CAPPED, eventCount: EXPERIMENT_LIMITS.EVENT_LIMIT }),
      ),
    ).toEqual({ allowed: true, reason: TRANSITION_REASON.ALLOWED });
    expect(
      decideTransition(
        input({ from: EXPERIMENT_STATUS.RUNNING, to: EXPERIMENT_STATUS.CAPPED, eventCount: EXPERIMENT_LIMITS.EVENT_LIMIT - 1 }),
      ),
    ).toEqual({ allowed: false, reason: TRANSITION_REASON.LIMIT_NOT_REACHED });
  });

  it('draft への差し戻しは、どの状態からも拒否する', () => {
    for (const from of [
      EXPERIMENT_STATUS.RUNNING,
      EXPERIMENT_STATUS.PAUSED,
      EXPERIMENT_STATUS.CAPPED,
      EXPERIMENT_STATUS.DRAFT,
    ]) {
      expect(decideTransition(input({ from, to: EXPERIMENT_STATUS.DRAFT }))).toEqual({
        allowed: false,
        reason: TRANSITION_REASON.DRAFT_RESTORE_FORBIDDEN,
      });
    }
  });

  it.each([
    [EXPERIMENT_STATUS.CAPPED, EXPERIMENT_STATUS.RUNNING],
    [EXPERIMENT_STATUS.DRAFT, EXPERIMENT_STATUS.PAUSED],
    [EXPERIMENT_STATUS.DRAFT, EXPERIMENT_STATUS.CAPPED],
    [EXPERIMENT_STATUS.PAUSED, EXPERIMENT_STATUS.CAPPED],
    [EXPERIMENT_STATUS.RUNNING, EXPERIMENT_STATUS.RUNNING],
  ])('%s → %s は定義された遷移ではないため拒否する', (from, to) => {
    expect(decideTransition(input({ from, to, eventCount: EXPERIMENT_LIMITS.EVENT_LIMIT }))).toEqual({
      allowed: false,
      reason: TRANSITION_REASON.NOT_ALLOWED_PAIR,
    });
  });

  it('requireTransition は拒否時に実験 ID と遷移元・先を含む例外を投げる', () => {
    expect(() =>
      requireTransition(input({ from: EXPERIMENT_STATUS.CAPPED, to: EXPERIMENT_STATUS.RUNNING })),
    ).toThrow(DomainCoreError);
    expect(() =>
      requireTransition(input({ from: EXPERIMENT_STATUS.CAPPED, to: EXPERIMENT_STATUS.RUNNING })),
    ).toThrow(/exp-1.*capped.*running/);
  });

  it('requireTransition は許可時に遷移先の状態を返す', () => {
    expect(requireTransition(input({}))).toBe(EXPERIMENT_STATUS.RUNNING);
  });
});
