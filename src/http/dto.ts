import type { ExperimentStatus } from '../config/domain';
import type { ExperimentAggregate } from '../infra/repository';

/** API と画面に出す実験の形。内部の所有者 ID は含めない。 */
export interface ExperimentDto {
  readonly id: string;
  readonly name: string;
  readonly status: ExperimentStatus;
  readonly goalName: string;
  readonly minSample: number;
  readonly publicKey: string;
  readonly createdAt: string;
  readonly eventCount: number;
  readonly variants: ReadonlyArray<{
    readonly id: string;
    readonly key: string;
    readonly label: string;
    readonly weight: number;
    readonly position: number;
    readonly payload: { readonly selector?: string; readonly text?: string; readonly color?: string };
  }>;
}

export function toExperimentDto(aggregate: ExperimentAggregate): ExperimentDto {
  const { experiment } = aggregate;
  return {
    id: experiment.id,
    name: experiment.name,
    status: experiment.status,
    goalName: experiment.goalName,
    minSample: experiment.minSample,
    publicKey: experiment.publicKey,
    createdAt: experiment.createdAt,
    eventCount: aggregate.eventCount,
    variants: aggregate.variants.map((variant) => ({
      id: variant.id,
      key: variant.key,
      label: variant.label,
      weight: variant.weight,
      position: variant.position,
      payload: variant.payload,
    })),
  };
}
