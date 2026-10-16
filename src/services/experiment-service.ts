import { EXPERIMENT_LIMITS, EXPERIMENT_STATUS, ExperimentStatus } from '../config/domain';
import { API_CODE } from '../config/http';
import { SERVICE_MESSAGE, TRANSITION_MESSAGE } from '../config/messages';
import { ConflictError, NotFoundError } from '../app/errors';
import type { AppDeps } from '../app/deps';
import { assign } from '../core/assign';
import { convert } from '../core/convert';
import { DomainCoreError, ValidationError } from '../core/errors';
import {
  ExperimentInput,
  parseConvertInput,
  parseExperimentInput,
  parsePublicKey,
  parseSimulateInput,
  parseStatusChangeInput,
  parseVisitorId,
  SimulateRequest,
} from '../core/experiment-input';
import { decideTransition } from '../core/transitions';
import { ExperimentSnapshot } from '../core/types';
import { simulate, SimulateResult } from '../core/simulate';
import { summarizeResults, ResultsSummary } from '../core/results';
import { ExperimentRepository, ExperimentAggregate, ExperimentRow, VariantRow } from '../infra/repository';
import { newId, newPublicKey, randomUnit } from '../infra/ids';
import { trace } from '../infra/trace';
import { fingerprintSecret } from '../core/fingerprint';

export interface VariantView {
  readonly key: string;
  readonly payload: Record<string, unknown>;
}

export interface AssignmentView {
  readonly variant: VariantView | null;
  readonly goalName: string | null;
}

export interface SimulationSummary {
  readonly processedVisitors: number;
  readonly conversions: number;
  readonly stoppedByLimit: boolean;
}

/** 実験の作成・編集・状態変更・模擬・計測・集計を行うアプリケーションサービス。 */
export class ExperimentService {
  private readonly repo: ExperimentRepository;

  constructor(private readonly deps: AppDeps) {
    this.repo = new ExperimentRepository(deps.db);
  }

  listExperiments(ownerSessionId: string): Promise<ExperimentAggregate[]> {
    return this.repo.listByOwner(ownerSessionId);
  }

  async getOwnedExperiment(ownerSessionId: string, id: string): Promise<ExperimentAggregate> {
    const aggregate = await this.repo.findOwned(id, ownerSessionId);
    if (aggregate === null) {
      trace('experiment.not_found', { experimentId: id, owner: await fingerprintSecret(ownerSessionId) });
      throw new NotFoundError(SERVICE_MESSAGE.EXPERIMENT_NOT_FOUND);
    }
    return aggregate;
  }

  async createExperiment(ownerSessionId: string, raw: unknown): Promise<ExperimentAggregate> {
    const input = parseExperimentInput(raw);
    const limit = EXPERIMENT_LIMITS.MAX_EXPERIMENTS_PER_SESSION;
    const owner = await fingerprintSecret(ownerSessionId);
    // 事前チェックは早期に分かりやすく断るためのもので、競合の安全性は下の条件付き挿入が担保する。
    const count = await this.repo.countByOwner(ownerSessionId);
    if (count >= limit) {
      trace('experiment.limit_reached', { owner, count });
      throw this.experimentLimitError(limit);
    }
    const id = newId();
    const inserted = await this.repo.insertExperimentIfUnderLimit(
      {
        id,
        ownerSessionId,
        publicKey: newPublicKey(this.deps.randomBytes),
        name: input.name,
        goalName: input.goalName,
        minSample: input.minSample,
        createdAt: this.deps.now().toISOString(),
        variants: input.variants.map((variant, position) => ({ ...variant, id: newId(), position })),
      },
      EXPERIMENT_STATUS.DRAFT,
      limit,
    );
    if (!inserted) {
      trace('experiment.limit_reached_on_insert', { owner });
      throw this.experimentLimitError(limit);
    }
    trace('experiment.created', { experimentId: id, owner });
    return this.getOwnedExperiment(ownerSessionId, id);
  }

  async updateExperiment(ownerSessionId: string, id: string, raw: unknown): Promise<ExperimentAggregate> {
    const aggregate = await this.getOwnedExperiment(ownerSessionId, id);
    const input = parseExperimentInput(raw);
    this.assertEditable(aggregate, input);
    await this.repo.updateExperiment(
      aggregate.experiment,
      { name: input.name, goalName: input.goalName, minSample: input.minSample },
      aggregate.variants.map((row, index) => {
        const next = input.variants[index]!;
        return { id: row.id, key: next.key, label: next.label, weight: next.weight, payload: next.payload };
      }),
    );
    trace('experiment.updated', {
      experimentId: id,
      owner: await fingerprintSecret(ownerSessionId),
      status: aggregate.experiment.status,
    });
    return this.getOwnedExperiment(ownerSessionId, id);
  }

  async changeStatus(ownerSessionId: string, id: string, raw: unknown): Promise<ExperimentAggregate> {
    const target = parseStatusChangeInput(raw);
    const aggregate = await this.getOwnedExperiment(ownerSessionId, id);
    const from = aggregate.experiment.status;
    const decision = decideTransition({
      experimentId: id,
      from,
      to: target,
      totalWeight: totalWeightOf(aggregate),
      variantCount: aggregate.variants.length,
      eventCount: aggregate.eventCount,
    });
    if (!decision.allowed) {
      trace('experiment.transition_denied', { experimentId: id, from, to: target, reason: decision.reason });
      throw new ConflictError(TRANSITION_MESSAGE.DENIED(id, from, target, decision.reason));
    }
    await this.compareAndSetStatus(aggregate.experiment, from, target);
    trace('experiment.status_changed', { experimentId: id, from, to: target });
    return this.getOwnedExperiment(ownerSessionId, id);
  }

  async simulateTraffic(ownerSessionId: string, id: string, raw: unknown): Promise<SimulationSummary> {
    const aggregate = await this.getOwnedExperiment(ownerSessionId, id);
    const request: SimulateRequest = parseSimulateInput(raw);
    if (aggregate.experiment.status !== EXPERIMENT_STATUS.RUNNING) {
      throw new ConflictError(SERVICE_MESSAGE.NOT_RUNNING_FOR_SIMULATION);
    }
    const result = this.runSimulation(aggregate, request);
    const now = this.deps.now().toISOString();
    await this.repo.saveSimulation(
      aggregate.experiment,
      EXPERIMENT_LIMITS.EVENT_LIMIT,
      result.assignments.map((item) => ({
        id: newId(),
        visitorId: item.visitorId,
        variantId: item.variantId,
        assignedAt: now,
      })),
      result.conversions.map((item) => ({
        id: newId(),
        visitorId: item.visitorId,
        goalName: item.goalName,
        convertedAt: now,
      })),
    );
    if (result.stoppedByLimit) {
      await this.compareAndSetStatus(aggregate.experiment, EXPERIMENT_STATUS.RUNNING, EXPERIMENT_STATUS.CAPPED);
    }
    trace('experiment.simulated', {
      experimentId: id,
      processedVisitors: result.processedVisitors,
      conversions: result.conversions.length,
      stoppedByLimit: result.stoppedByLimit,
    });
    return {
      processedVisitors: result.processedVisitors,
      conversions: result.conversions.length,
      stoppedByLimit: result.stoppedByLimit,
    };
  }

  async results(ownerSessionId: string, id: string): Promise<ResultsSummary> {
    const aggregate = await this.getOwnedExperiment(ownerSessionId, id);
    const counts = await this.repo.variantCounts(aggregate.experiment);
    const byId = new Map(counts.map((row) => [row.id, row]));
    const variants = aggregate.variants.map((variant) => {
      const row = byId.get(variant.id);
      if (row === undefined) {
        throw new DomainCoreError(SERVICE_MESSAGE.MISSING_RESULT_ROW(variant.id, id));
      }
      return row;
    });
    return summarizeResults({
      status: aggregate.experiment.status,
      eventCount: aggregate.eventCount,
      minSample: aggregate.experiment.minSample,
      variants,
    });
  }

  /** 公開キーと訪問者 ID から割当を返す。保存は必要なときだけ行う。 */
  async assignVisitor(rawPublicKey: unknown, rawVisitorId: unknown): Promise<AssignmentView> {
    const publicKey = parsePublicKey(rawPublicKey);
    const visitorId = parseVisitorId(rawVisitorId);
    const aggregate = await this.repo.findByPublicKey(publicKey);
    if (aggregate === null) {
      trace('assign.unknown_key', { publicKey });
      return { variant: null, goalName: null };
    }
    await this.capIfLimitReached(aggregate, aggregate.eventCount);
    const saved = await this.repo.findAssignment(aggregate.experiment.id, visitorId);
    const decision = assign({
      experiment: toSnapshot(aggregate),
      publicKey,
      visitorId,
      savedVariantId: saved?.variantId ?? null,
    });
    if (decision.variantId === null) {
      trace('assign.default', { experimentId: aggregate.experiment.id, status: aggregate.experiment.status });
      return { variant: null, goalName: null };
    }
    let variantId = decision.variantId;
    if (decision.persist) {
      const stored = await this.repo.saveAssignmentIfUnderLimit(
        aggregate.experiment,
        visitorId,
        variantId,
        newId(),
        this.deps.now().toISOString(),
        EXPERIMENT_LIMITS.EVENT_LIMIT,
      );
      if (stored === null) {
        // 読み取り後に別の要求が上限へ達した。保存せず、上限到達後と同じく対照を返して capped にそろえる。
        trace('assign.capped_on_insert', { experimentId: aggregate.experiment.id });
        await this.capIfLimitReached(aggregate, EXPERIMENT_LIMITS.EVENT_LIMIT);
        variantId = requireControlVariant(aggregate).id;
      } else {
        variantId = stored.variantId;
        await this.capIfLimitReached(aggregate, aggregate.eventCount + 1);
      }
    }
    const variant = aggregate.variants.find((row) => row.id === variantId);
    if (variant === undefined) {
      throw new DomainCoreError(SERVICE_MESSAGE.MISSING_ASSIGNED_VARIANT(variantId, aggregate.experiment.id));
    }
    trace('assign.decided', {
      experimentId: aggregate.experiment.id,
      variantKey: variant.key,
      source: decision.source,
      persisted: decision.persist,
    });
    return {
      variant: { key: variant.key, payload: { ...variant.payload } },
      goalName: aggregate.experiment.goalName,
    };
  }

  /** 転換を記録する。記録した場合のみ true を返す（理由は応答に含めない）。 */
  async convertVisitor(rawPublicKey: unknown, raw: unknown): Promise<boolean> {
    const publicKey = parsePublicKey(rawPublicKey);
    const input = parseConvertInput(raw);
    const aggregate = await this.repo.findByPublicKey(publicKey);
    if (aggregate === null) {
      trace('convert.unknown_key', { publicKey });
      return false;
    }
    await this.capIfLimitReached(aggregate, aggregate.eventCount);
    if (input.goalName !== aggregate.experiment.goalName) {
      trace('convert.goal_mismatch', { experimentId: aggregate.experiment.id, goalName: input.goalName });
      return false;
    }
    const saved = await this.repo.findAssignment(aggregate.experiment.id, input.visitorId);
    const recordedGoals = saved === null ? [] : await this.repo.recordedGoals(saved.id);
    const decision = convert({
      experiment: { id: aggregate.experiment.id, status: aggregate.experiment.status, eventCount: aggregate.eventCount },
      assignment: saved === null ? null : { id: saved.id, variantId: saved.variantId },
      goalName: input.goalName,
      recordedGoals,
    });
    trace('convert.decided', { experimentId: aggregate.experiment.id, reason: decision.reason });
    if (!decision.record || saved === null) {
      return false;
    }
    const inserted = await this.repo.insertConversionIfUnderLimit(
      aggregate.experiment,
      saved.id,
      input.goalName,
      newId(),
      this.deps.now().toISOString(),
      EXPERIMENT_LIMITS.EVENT_LIMIT,
    );
    if (inserted === 1) {
      await this.capIfLimitReached(aggregate, aggregate.eventCount + 1);
      return true;
    }
    // 記録されなかった理由は、重複か、読み取り後に別の要求が上限へ達したかのどちらか。実件数で確かめる。
    const currentCount = await this.repo.eventCount(aggregate.experiment.id);
    trace('convert.not_inserted', { experimentId: aggregate.experiment.id, currentCount });
    await this.capIfLimitReached(aggregate, currentCount);
    return false;
  }

  private assertEditable(aggregate: ExperimentAggregate, input: ExperimentInput): void {
    if (input.variants.length !== aggregate.variants.length) {
      throw new ConflictError(SERVICE_MESSAGE.VARIANT_COUNT_FIXED);
    }
    const isDraft = aggregate.experiment.status === EXPERIMENT_STATUS.DRAFT;
    if (!isDraft) {
      const keysChanged = input.variants.some((variant, index) => variant.key !== aggregate.variants[index]!.key);
      if (keysChanged) {
        throw new ConflictError(SERVICE_MESSAGE.VARIANT_KEYS_LOCKED);
      }
      const total = input.variants.reduce((sum, variant) => sum + variant.weight, 0);
      if (total <= 0) {
        throw new ConflictError(SERVICE_MESSAGE.ZERO_WEIGHT_WHILE_ACTIVE);
      }
    }
  }

  private runSimulation(aggregate: ExperimentAggregate, request: SimulateRequest): SimulateResult {
    try {
      return simulate({
        experiment: toSnapshot(aggregate),
        publicKey: aggregate.experiment.publicKey,
        goalName: aggregate.experiment.goalName,
        visitorCount: request.visitorCount,
        conversionRates: request.conversionRates,
        random: () => randomUnit(this.deps.randomBytes),
      });
    } catch (error) {
      if (error instanceof DomainCoreError) {
        throw new ValidationError(SERVICE_MESSAGE.SIMULATION_INPUT_REJECTED(error.message));
      }
      throw error;
    }
  }

  private experimentLimitError(limit: number): ConflictError {
    return new ConflictError(SERVICE_MESSAGE.EXPERIMENT_LIMIT_REACHED(limit), API_CODE.EXPERIMENT_LIMIT_REACHED);
  }

  private async compareAndSetStatus(
    experiment: ExperimentRow,
    from: ExperimentStatus,
    to: ExperimentStatus,
  ): Promise<void> {
    const updated = await this.repo.setStatusIfCurrent(experiment.id, experiment.ownerSessionId, from, to);
    if (!updated) {
      trace('experiment.status_conflict', { experimentId: experiment.id, from, to });
      throw new ConflictError(SERVICE_MESSAGE.CONCURRENT_UPDATE);
    }
  }

  /** 件数が上限に達していれば、実行中の実験を上限到達（capped）に遷移させる。計測の入口でも揃える。 */
  private async capIfLimitReached(aggregate: ExperimentAggregate, countAfterWrite: number): Promise<void> {
    if (countAfterWrite < EXPERIMENT_LIMITS.EVENT_LIMIT) {
      return;
    }
    if (aggregate.experiment.status !== EXPERIMENT_STATUS.RUNNING) {
      return;
    }
    const updated = await this.repo.setStatusIfCurrent(
      aggregate.experiment.id,
      aggregate.experiment.ownerSessionId,
      EXPERIMENT_STATUS.RUNNING,
      EXPERIMENT_STATUS.CAPPED,
    );
    trace('experiment.capped', { experimentId: aggregate.experiment.id, countAfterWrite, applied: updated });
  }
}

/** 先頭のバリアント（対照）を返す。無ければ明示的に失敗する。 */
function requireControlVariant(aggregate: ExperimentAggregate): VariantRow {
  const control = aggregate.variants[0];
  if (control === undefined) {
    throw new DomainCoreError(SERVICE_MESSAGE.MISSING_ASSIGNED_VARIANT('control', aggregate.experiment.id));
  }
  return control;
}

function totalWeightOf(aggregate: ExperimentAggregate): number {
  return aggregate.variants.reduce((sum, variant) => sum + variant.weight, 0);
}

/** Domain Core に渡すスナップショット。バリアントは position 順（先頭が対照）。 */
export function toSnapshot(aggregate: ExperimentAggregate): ExperimentSnapshot {
  return {
    id: aggregate.experiment.id,
    status: aggregate.experiment.status,
    variants: aggregate.variants.map((variant) => ({ id: variant.id, weight: variant.weight })),
    eventCount: aggregate.eventCount,
  };
}

