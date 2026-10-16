import {
  EXPERIMENT_LIMITS,
  EXPERIMENT_STATUS,
  ExperimentStatus,
  TRANSITION_REASON,
  TransitionReason,
} from '../config/domain';
import { TRANSITION_MESSAGE } from '../config/messages';
import { DomainCoreError } from './errors';

export interface TransitionInput {
  readonly experimentId: string;
  readonly from: ExperimentStatus;
  readonly to: ExperimentStatus;
  /** バリアントの配分率の合計。 */
  readonly totalWeight: number;
  readonly variantCount: number;
  readonly eventCount: number;
}

export interface TransitionDecision {
  readonly allowed: boolean;
  readonly reason: TransitionReason;
}

/** 要件 6 の状態遷移を判定する純粋関数。保存は呼び出し側が行う。 */
export function decideTransition(input: TransitionInput): TransitionDecision {
  const { from, to } = input;

  if (to === EXPERIMENT_STATUS.DRAFT) {
    return deny(TRANSITION_REASON.DRAFT_RESTORE_FORBIDDEN);
  }
  if (from === EXPERIMENT_STATUS.DRAFT && to === EXPERIMENT_STATUS.RUNNING) {
    if (input.totalWeight <= 0) {
      return deny(TRANSITION_REASON.WEIGHT_NOT_POSITIVE);
    }
    if (input.variantCount < 2) {
      return deny(TRANSITION_REASON.VARIANT_COUNT_TOO_FEW);
    }
    return allow();
  }
  if (from === EXPERIMENT_STATUS.RUNNING && to === EXPERIMENT_STATUS.CAPPED) {
    return input.eventCount >= EXPERIMENT_LIMITS.EVENT_LIMIT
      ? allow()
      : deny(TRANSITION_REASON.LIMIT_NOT_REACHED);
  }
  if (PAIRS_WITHOUT_EXTRA_CHECK.some(([a, b]) => a === from && b === to)) {
    return allow();
  }
  return deny(TRANSITION_REASON.NOT_ALLOWED_PAIR);
}

/** 許可された遷移なら遷移先の状態を返し、拒否なら文脈付きの例外を投げる。 */
export function requireTransition(input: TransitionInput): ExperimentStatus {
  const decision = decideTransition(input);
  if (!decision.allowed) {
    throw new DomainCoreError(
      TRANSITION_MESSAGE.DENIED(input.experimentId, input.from, input.to, decision.reason),
    );
  }
  return input.to;
}

const PAIRS_WITHOUT_EXTRA_CHECK: ReadonlyArray<readonly [ExperimentStatus, ExperimentStatus]> = [
  [EXPERIMENT_STATUS.RUNNING, EXPERIMENT_STATUS.PAUSED],
  [EXPERIMENT_STATUS.PAUSED, EXPERIMENT_STATUS.RUNNING],
  [EXPERIMENT_STATUS.CAPPED, EXPERIMENT_STATUS.PAUSED],
];

function allow(): TransitionDecision {
  return { allowed: true, reason: TRANSITION_REASON.ALLOWED };
}

function deny(reason: TransitionReason): TransitionDecision {
  return { allowed: false, reason };
}
