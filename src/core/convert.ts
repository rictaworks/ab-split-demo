import { CONVERT_REASON, ConvertReason, EXPERIMENT_STATUS, ExperimentStatus } from '../config/domain';
import { isCapped } from './assign';
import { FIELD_NAME } from '../config/messages';
import { requireNonEmptyString } from './validation';

export interface ConvertExperiment {
  readonly id: string;
  readonly status: ExperimentStatus;
  readonly eventCount: number;
}

export interface ConvertAssignment {
  readonly id: string;
  readonly variantId: string;
}

export interface ConvertInput {
  readonly experiment: ConvertExperiment | null;
  /** 当該訪問者の割当。未割当なら null。 */
  readonly assignment: ConvertAssignment | null;
  readonly goalName: string;
  /** 当該割当で既に記録済みのゴール名。 */
  readonly recordedGoals: readonly string[];
}

export interface ConvertResult {
  /** true のとき、呼び出し側は（割当, ゴール名）の転換を保存する。 */
  readonly record: boolean;
  readonly reason: ConvertReason;
}

/**
 * 転換を記録すべきかを判定する。純粋関数で、保存は呼び出し側が行う。
 * 応答は成否のみを返す方針のため、理由は呼び出し側のログ用に限る。
 */
export function convert(input: ConvertInput): ConvertResult {
  const goalName = requireNonEmptyString(FIELD_NAME.GOAL_NAME, input.goalName);
  const experiment = input.experiment;

  if (experiment === null) {
    return { record: false, reason: CONVERT_REASON.NOT_FOUND };
  }
  if (experiment.status !== EXPERIMENT_STATUS.RUNNING && experiment.status !== EXPERIMENT_STATUS.CAPPED) {
    return { record: false, reason: CONVERT_REASON.NOT_RUNNING };
  }
  if (isCapped(experiment)) {
    return { record: false, reason: CONVERT_REASON.CAPPED };
  }
  if (input.assignment === null) {
    return { record: false, reason: CONVERT_REASON.NO_ASSIGNMENT };
  }
  if (input.recordedGoals.includes(goalName)) {
    return { record: false, reason: CONVERT_REASON.DUPLICATE };
  }
  return { record: true, reason: CONVERT_REASON.RECORDED };
}
