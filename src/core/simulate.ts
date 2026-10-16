import { EXPERIMENT_LIMITS, EXPERIMENT_STATUS } from '../config/domain';
import { ERROR_MESSAGE } from '../config/messages';
import { assign } from './assign';
import { convert } from './convert';
import { DomainCoreError } from './errors';
import { ExperimentSnapshot } from './types';

export interface SimulateInput {
  readonly experiment: ExperimentSnapshot;
  readonly publicKey: string;
  readonly goalName: string;
  readonly visitorCount: number;
  /** バリアント ID → 想定転換率（0 以上 1 以下）。全バリアント分が必要。 */
  readonly conversionRates: Readonly<Record<string, number>>;
  /** 0 以上 1 未満の一様乱数を返す関数。テスト時は決定的な関数を注入する。 */
  readonly random: () => number;
}

export interface SimulatedAssignment {
  readonly visitorId: string;
  readonly variantId: string;
}

export interface SimulatedConversion {
  readonly visitorId: string;
  readonly variantId: string;
  readonly goalName: string;
}

export interface SimulateResult {
  readonly processedVisitors: number;
  readonly assignments: readonly SimulatedAssignment[];
  readonly conversions: readonly SimulatedConversion[];
  /** イベント上限に達して打ち切ったかどうか。 */
  readonly stoppedByLimit: boolean;
}

/**
 * 擬似訪問者を生成して割当・転換を適用する。純粋関数で、乱数は注入された関数から取る。
 * 保存は行わず、呼び出し側が結果を書き込む。
 */
export function simulate(input: SimulateInput): SimulateResult {
  const { experiment } = input;
  if (experiment.status !== EXPERIMENT_STATUS.RUNNING) {
    throw new DomainCoreError(ERROR_MESSAGE.NOT_RUNNING_FOR_SIMULATION(experiment.id, experiment.status));
  }
  if (!Number.isInteger(input.visitorCount) || input.visitorCount < 1) {
    throw new DomainCoreError(ERROR_MESSAGE.INVALID_VISITOR_COUNT(input.visitorCount));
  }
  experiment.variants.forEach((variant) => {
    const rate = input.conversionRates[variant.id];
    if (rate === undefined) {
      throw new DomainCoreError(ERROR_MESSAGE.MISSING_CONVERSION_RATE(variant.id));
    }
    if (typeof rate !== 'number' || !(rate >= 0 && rate <= 1)) {
      throw new DomainCoreError(ERROR_MESSAGE.INVALID_CONVERSION_RATE(variant.id, rate));
    }
  });

  const assignments: SimulatedAssignment[] = [];
  const conversions: SimulatedConversion[] = [];
  let eventCount = experiment.eventCount;

  for (let index = 0; index < input.visitorCount; index += 1) {
    if (eventCount >= EXPERIMENT_LIMITS.EVENT_LIMIT) {
      break;
    }
    const visitorId = generateVisitorId(input.random, index);
    const decision = assign({
      experiment: { ...experiment, eventCount },
      publicKey: input.publicKey,
      visitorId,
      savedVariantId: null,
    });
    if (decision.variantId === null || !decision.persist) {
      throw new DomainCoreError(ERROR_MESSAGE.UNEXPECTED_ASSIGN_DECISION(experiment.id, decision));
    }
    const variantId = decision.variantId;
    assignments.push({ visitorId, variantId });
    eventCount += 1;

    const converts = input.random() < input.conversionRates[variantId]!;
    if (!converts) {
      continue;
    }
    // 模擬では割当 ID を発行しないため、訪問者 ID を割当の識別子として渡す（記録判定にのみ使う）。
    const outcome = convert({
      experiment: { id: experiment.id, status: EXPERIMENT_STATUS.RUNNING, eventCount },
      assignment: { id: visitorId, variantId },
      goalName: input.goalName,
      recordedGoals: [],
    });
    if (outcome.record) {
      conversions.push({ visitorId, variantId, goalName: input.goalName });
      eventCount += 1;
    }
  }

  return {
    processedVisitors: assignments.length,
    assignments,
    conversions,
    stoppedByLimit: eventCount >= EXPERIMENT_LIMITS.EVENT_LIMIT,
  };
}

/** 乱数の上位 32 ビットと連番から訪問者 ID を作る。連番により同一実行内の重複を防ぐ。 */
function generateVisitorId(random: () => number, index: number): string {
  const randomPart = Math.floor(random() * 0x100000000).toString(16).padStart(8, '0');
  return `${randomPart}${index.toString(16)}`;
}
