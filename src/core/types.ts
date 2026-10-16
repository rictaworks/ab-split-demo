import { ExperimentStatus } from '../config/domain';

/** 割当・集計に必要な、バリアントの配分情報。position 順（先頭が対照）で渡す。 */
export interface VariantWeight {
  readonly id: string;
  readonly weight: number;
}

/** Domain Core に渡す実験のスナップショット。DB の読み取りは HTTP 層が行う。 */
export interface ExperimentSnapshot {
  readonly id: string;
  readonly status: ExperimentStatus;
  readonly variants: readonly VariantWeight[];
  readonly eventCount: number;
}
