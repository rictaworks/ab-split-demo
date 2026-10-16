import {
  EXPERIMENT_LIMITS,
  ExperimentStatus,
  JUDGEMENT,
  JudgementCode,
  SIGNIFICANCE_LEVEL,
} from '../config/domain';
import { ERROR_MESSAGE, FIELD_NAME } from '../config/messages';
import { DomainCoreError } from './errors';
import { twoProportionZTest } from './stats';
import { requireCount } from './validation';

export interface VariantCount {
  readonly id: string;
  readonly exposures: number;
  readonly conversions: number;
}

export interface ResultsInput {
  readonly status: ExperimentStatus;
  readonly eventCount: number;
  /** 実験ごとの最小サンプル数（experiments.min_sample）。 */
  readonly minSample: number;
  /** 先頭を対照として、position 順に渡す。 */
  readonly variants: readonly VariantCount[];
}

export interface VariantResult {
  readonly id: string;
  readonly exposures: number;
  readonly conversions: number;
  /** 転換率。露出数 0 のときは未定義（null）。 */
  readonly rate: number | null;
  /** 対照に対するリフト。対照・データ不足のときは null。 */
  readonly lift: number | null;
  /** 二標本比率の z 検定の p 値。出せないときは null。 */
  readonly pValue: number | null;
  readonly judgement: JudgementCode;
}

export interface ResultsSummary {
  readonly status: ExperimentStatus;
  readonly eventLimitReached: boolean;
  /** バリアントが 2 件以上あり、比較できるときに true。 */
  readonly comparable: boolean;
  readonly variants: readonly VariantResult[];
}

/** バリアント別の露出・転換・転換率・リフト・p 値と判定を集計する。純粋関数。 */
export function summarizeResults(input: ResultsInput): ResultsSummary {
  const minSample = requireMinSample(input.minSample);
  requireCount(FIELD_NAME.EVENT_COUNT, input.eventCount);
  if (input.variants.length === 0) {
    throw new DomainCoreError(ERROR_MESSAGE.NO_VARIANTS_FOR_RESULTS);
  }
  input.variants.forEach((variant) => {
    requireVariantCount(variant.id, FIELD_NAME.EXPOSURES, variant.exposures);
    requireVariantCount(variant.id, FIELD_NAME.CONVERSIONS, variant.conversions);
    if (variant.conversions > variant.exposures) {
      throw new DomainCoreError(
        ERROR_MESSAGE.CONVERSIONS_EXCEED_EXPOSURES(variant.id, variant.exposures, variant.conversions),
      );
    }
  });

  const [control, ...targets] = input.variants as [VariantCount, ...VariantCount[]];
  const controlRate = rateOf(control);

  const controlResult: VariantResult = {
    id: control.id,
    exposures: control.exposures,
    conversions: control.conversions,
    rate: controlRate,
    lift: null,
    pValue: null,
    judgement: JUDGEMENT.CONTROL,
  };

  const targetResults = targets.map((target): VariantResult => {
    const base = { id: target.id, exposures: target.exposures, conversions: target.conversions, rate: rateOf(target) };
    const insufficient: VariantResult = { ...base, lift: null, pValue: null, judgement: JUDGEMENT.INSUFFICIENT_DATA };

    if (control.exposures < minSample || target.exposures < minSample) {
      return insufficient;
    }
    if (controlRate === null || controlRate === 0 || base.rate === null) {
      return insufficient;
    }
    const test = twoProportionZTest(control.conversions, control.exposures, target.conversions, target.exposures);
    if (test === null) {
      return insufficient;
    }
    return {
      ...base,
      lift: (base.rate - controlRate) / controlRate,
      pValue: test.pValue,
      judgement: test.pValue < SIGNIFICANCE_LEVEL ? JUDGEMENT.SIGNIFICANT : JUDGEMENT.NOT_SIGNIFICANT,
    };
  });

  return {
    status: input.status,
    eventLimitReached: input.eventCount >= EXPERIMENT_LIMITS.EVENT_LIMIT,
    comparable: input.variants.length >= 2,
    variants: [controlResult, ...targetResults],
  };
}

function requireVariantCount(variantId: string, name: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new DomainCoreError(ERROR_MESSAGE.INVALID_VARIANT_COUNT(variantId, name, value));
  }
}

function rateOf(variant: VariantCount): number | null {
  return variant.exposures === 0 ? null : variant.conversions / variant.exposures;
}

function requireMinSample(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new DomainCoreError(ERROR_MESSAGE.INVALID_MIN_SAMPLE(value));
  }
  return value;
}
