import {
  ASSIGN_SOURCE,
  AssignSource,
  EXPERIMENT_LIMITS,
  EXPERIMENT_STATUS,
  HASH_SETTINGS,
} from '../config/domain';
import { ERROR_MESSAGE, FIELD_NAME } from '../config/messages';
import { DomainCoreError } from './errors';
import { fnv1a32 } from './hash';
import { requireCount, requireNonEmptyString } from './validation';
import { ExperimentSnapshot, VariantWeight } from './types';

export interface AssignInput {
  readonly experiment: ExperimentSnapshot | null;
  readonly publicKey: string;
  readonly visitorId: string;
  /** 保存済みの割当バリアント ID。未割当なら null。 */
  readonly savedVariantId: string | null;
}

export interface AssignResult {
  /** 割当バリアント ID。既定表示のときは null。 */
  readonly variantId: string | null;
  readonly source: AssignSource;
  /** true のとき、呼び出し側は（実験, 訪問者 ID）の割当を保存し、露出として計数する。 */
  readonly persist: boolean;
}

const SERVING_STATUSES: readonly string[] = [EXPERIMENT_STATUS.RUNNING, EXPERIMENT_STATUS.CAPPED];

/**
 * 訪問者へバリアントを割り当てる。純粋関数で、保存や乱数は行わない。
 * 要件 3・4.1 の順序（存在・状態 → 保存済み → 上限 → ハッシュ）に従う。
 */
export function assign(input: AssignInput): AssignResult {
  const publicKey = requireNonEmptyString(FIELD_NAME.PUBLIC_KEY, input.publicKey);
  const visitorId = requireNonEmptyString(FIELD_NAME.VISITOR_ID, input.visitorId);
  const experiment = input.experiment;

  if (experiment === null || !SERVING_STATUSES.includes(experiment.status)) {
    return { variantId: null, source: ASSIGN_SOURCE.DEFAULT, persist: false };
  }

  requireCount(FIELD_NAME.EVENT_COUNT, experiment.eventCount);
  validateVariants(experiment.id, experiment.variants);

  // 要件 3：保存済みの割当は上限到達後も常に優先する（再保存はしない）。
  if (input.savedVariantId !== null) {
    return { variantId: input.savedVariantId, source: ASSIGN_SOURCE.EXISTING, persist: false };
  }

  // 上限到達後の新規訪問者には対照を返し、保存しない。
  if (isCapped(experiment)) {
    return { variantId: experiment.variants[0]!.id, source: ASSIGN_SOURCE.CAPPED, persist: false };
  }

  const bucket = bucketOf(publicKey, visitorId);
  return {
    variantId: selectVariantId(experiment.variants, bucket),
    source: ASSIGN_SOURCE.HASHED,
    persist: true,
  };
}

/** 状態が capped、またはイベント数が上限に達している実験かどうか。 */
export function isCapped(experiment: Pick<ExperimentSnapshot, 'status' | 'eventCount'>): boolean {
  return (
    experiment.status === EXPERIMENT_STATUS.CAPPED ||
    experiment.eventCount >= EXPERIMENT_LIMITS.EVENT_LIMIT
  );
}

/** 公開キーと訪問者 ID を連結し、FNV-1a で整数化して 0 以上 BUCKETS 未満の区間番号にする。 */
export function bucketOf(publicKey: string, visitorId: string): number {
  return fnv1a32(publicKey + visitorId) % HASH_SETTINGS.BUCKETS;
}

/**
 * 配分率の累積区間（0 以上 BUCKETS 未満）に区間番号を写し、該当バリアント ID を返す。
 * 配分率 0 のバリアントは区間幅が 0 となり選ばれない。
 */
export function selectVariantId(variants: readonly VariantWeight[], bucket: number): string {
  const total = variants.reduce((sum, variant) => sum + variant.weight, 0);
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight;
    const upperBound = Math.floor((cumulative * HASH_SETTINGS.BUCKETS) / total);
    if (bucket < upperBound) {
      return variant.id;
    }
  }
  throw new DomainCoreError(ERROR_MESSAGE.BUCKET_NOT_MAPPED(bucket, total));
}

function validateVariants(experimentId: string, variants: readonly VariantWeight[]): void {
  if (variants.length === 0) {
    throw new DomainCoreError(ERROR_MESSAGE.NO_VARIANTS(experimentId));
  }
  for (const variant of variants) {
    if (!Number.isInteger(variant.weight) || variant.weight < 0) {
      throw new DomainCoreError(ERROR_MESSAGE.INVALID_WEIGHT(variant.id, variant.weight));
    }
  }
  const total = variants.reduce((sum, variant) => sum + variant.weight, 0);
  if (total === 0) {
    throw new DomainCoreError(ERROR_MESSAGE.ZERO_TOTAL_WEIGHT(experimentId));
  }
}
