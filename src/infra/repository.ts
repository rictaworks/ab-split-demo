import { EXPERIMENT_STATUS, ExperimentStatus } from '../config/domain';
import { SQL } from '../config/sql';
import { REPOSITORY_MESSAGE } from '../config/messages';
import type { VariantPayload } from '../core/experiment-input';
import type { D1Like } from './d1';

export interface ExperimentRow {
  readonly id: string;
  readonly ownerSessionId: string;
  readonly publicKey: string;
  readonly name: string;
  readonly status: ExperimentStatus;
  readonly goalName: string;
  readonly minSample: number;
  readonly createdAt: string;
}

export interface VariantRow {
  readonly id: string;
  readonly experimentId: string;
  readonly key: string;
  readonly label: string;
  readonly weight: number;
  readonly payload: VariantPayload;
  readonly position: number;
}

export interface ExperimentAggregate {
  readonly experiment: ExperimentRow;
  /** position 順（先頭が対照）。 */
  readonly variants: readonly VariantRow[];
  readonly eventCount: number;
}

export interface NewExperiment {
  readonly id: string;
  readonly ownerSessionId: string;
  readonly publicKey: string;
  readonly name: string;
  readonly goalName: string;
  readonly minSample: number;
  readonly createdAt: string;
  readonly variants: ReadonlyArray<{
    readonly id: string;
    readonly key: string;
    readonly label: string;
    readonly weight: number;
    readonly payload: VariantPayload;
    readonly position: number;
  }>;
}

export interface SavedAssignment {
  readonly id: string;
  readonly variantId: string;
}

export interface VariantCountRow {
  readonly id: string;
  readonly exposures: number;
  readonly conversions: number;
}

const STATUS_VALUES: readonly string[] = Object.values(EXPERIMENT_STATUS);


/** D1 へのアクセスを集約する。SQL は SQL（config/sql.ts）から参照し、値はバインドする。 */
export class ExperimentRepository {
  constructor(private readonly db: D1Like) {}

  async countByOwner(ownerSessionId: string): Promise<number> {
    const row = await this.db.prepare(SQL.EXPERIMENT_COUNT_BY_OWNER).bind(ownerSessionId).first<{ n: number }>();
    return requireCountRow(row, 'EXPERIMENT_COUNT_BY_OWNER');
  }

  async listByOwner(ownerSessionId: string): Promise<ExperimentAggregate[]> {
    const rows = await this.db.prepare(SQL.EXPERIMENT_LIST_BY_OWNER).bind(ownerSessionId).all<Record<string, unknown>>();
    const aggregates: ExperimentAggregate[] = [];
    for (const row of rows.results) {
      const experiment = toExperimentRow(row);
      aggregates.push(await this.loadAggregate(experiment));
    }
    return aggregates;
  }

  async findOwned(id: string, ownerSessionId: string): Promise<ExperimentAggregate | null> {
    const row = await this.db
      .prepare(SQL.EXPERIMENT_SELECT_OWNED)
      .bind(id, ownerSessionId)
      .first<Record<string, unknown>>();
    return row === null ? null : this.loadAggregate(toExperimentRow(row));
  }

  async findByPublicKey(publicKey: string): Promise<ExperimentAggregate | null> {
    const row = await this.db
      .prepare(SQL.EXPERIMENT_SELECT_BY_PUBLIC_KEY)
      .bind(publicKey)
      .first<Record<string, unknown>>();
    return row === null ? null : this.loadAggregate(toExperimentRow(row));
  }

  /**
   * 実験とバリアントを保存する。所有者の実験数が上限未満のときだけ挿入し、
   * 上限に達していれば何も保存せず false を返す（件数の判定と挿入は 1 文で行う）。
   */
  async insertExperimentIfUnderLimit(
    experiment: NewExperiment,
    status: ExperimentStatus,
    limit: number,
  ): Promise<boolean> {
    const statements = [
      this.db
        .prepare(SQL.EXPERIMENT_INSERT_IF_UNDER_LIMIT)
        .bind(
          experiment.id,
          experiment.ownerSessionId,
          experiment.publicKey,
          experiment.name,
          status,
          experiment.goalName,
          experiment.minSample,
          experiment.createdAt,
          experiment.ownerSessionId,
          limit,
        ),
      ...experiment.variants.map((variant) =>
        this.db
          .prepare(SQL.VARIANT_INSERT_IF_EXPERIMENT_EXISTS)
          .bind(
            variant.id,
            experiment.id,
            experiment.ownerSessionId,
            variant.key,
            variant.label,
            variant.weight,
            JSON.stringify(variant.payload),
            variant.position,
            experiment.id,
            experiment.ownerSessionId,
          ),
      ),
    ];
    const results = await this.db.batch(statements);
    const inserted = results[0]?.meta.changes;
    if (inserted === undefined) {
      throw new Error(REPOSITORY_MESSAGE.BATCH_RESULT_MISSING(experiment.id));
    }
    return inserted === 1;
  }

  async updateExperiment(
    experiment: ExperimentRow,
    fields: { name: string; goalName: string; minSample: number },
    variants: ReadonlyArray<{ id: string; key: string; label: string; weight: number; payload: VariantPayload }>,
  ): Promise<void> {
    const statements = [
      this.db
        .prepare(SQL.EXPERIMENT_UPDATE_FIELDS)
        .bind(fields.name, fields.goalName, fields.minSample, experiment.id, experiment.ownerSessionId),
      ...variants.map((variant) =>
        this.db
          .prepare(SQL.VARIANT_UPDATE)
          .bind(
            variant.key,
            variant.label,
            variant.weight,
            JSON.stringify(variant.payload),
            variant.id,
            experiment.ownerSessionId,
          ),
      ),
    ];
    await this.db.batch(statements);
  }

  /** 状態を compare-and-set で更新する。他の要求が先に変えていれば false を返す。 */
  async setStatusIfCurrent(
    id: string,
    ownerSessionId: string,
    from: ExperimentStatus,
    to: ExperimentStatus,
  ): Promise<boolean> {
    const result = await this.db.prepare(SQL.EXPERIMENT_SET_STATUS).bind(to, id, ownerSessionId, from).run();
    return result.meta.changes === 1;
  }

  async findAssignment(experimentId: string, visitorId: string): Promise<SavedAssignment | null> {
    const row = await this.db
      .prepare(SQL.ASSIGNMENT_SELECT)
      .bind(experimentId, visitorId)
      .first<{ id: string; variant_id: string }>();
    return row === null ? null : { id: row.id, variantId: row.variant_id };
  }

  /**
   * 割当を保存する。既に存在すれば何もせず、保存後の割当（既存または新規）を返す。
   * イベント数が上限に達していて保存されなかった場合は null を返す（呼び出し側は対照固定で応答する）。
   */
  async saveAssignmentIfUnderLimit(
    experiment: ExperimentRow,
    visitorId: string,
    variantId: string,
    assignmentId: string,
    assignedAt: string,
    limit: number,
  ): Promise<SavedAssignment | null> {
    await this.db
      .prepare(SQL.ASSIGNMENT_INSERT_IF_UNDER_LIMIT)
      .bind(
        assignmentId,
        experiment.id,
        experiment.ownerSessionId,
        visitorId,
        variantId,
        assignedAt,
        experiment.id,
        experiment.id,
        limit,
      )
      .run();
    // 挿入されなかった理由は「既に同じ訪問者がいる」か「上限到達」のどちらかである（それ以外は例外になる）。
    return this.findAssignment(experiment.id, visitorId);
  }

  async recordedGoals(assignmentId: string): Promise<string[]> {
    const rows = await this.db.prepare(SQL.CONVERSION_GOALS_BY_ASSIGNMENT).bind(assignmentId).all<{ goal_name: string }>();
    return rows.results.map((row) => row.goal_name);
  }

  /**
   * 転換を保存する。イベント数が上限未満で、かつ（割当, ゴール）が未記録のときだけ保存する。
   * 保存した件数（0 か 1）を返す。
   */
  async insertConversionIfUnderLimit(
    experiment: ExperimentRow,
    assignmentId: string,
    goalName: string,
    conversionId: string,
    convertedAt: string,
    limit: number,
  ): Promise<number> {
    const result = await this.db
      .prepare(SQL.CONVERSION_INSERT_IF_UNDER_LIMIT)
      .bind(
        conversionId,
        assignmentId,
        experiment.ownerSessionId,
        goalName,
        convertedAt,
        experiment.id,
        experiment.id,
        limit,
      )
      .run();
    return result.meta.changes;
  }

  async eventCount(experimentId: string): Promise<number> {
    const row = await this.db.prepare(SQL.EVENT_COUNT).bind(experimentId, experimentId).first<{ n: number }>();
    return requireCountRow(row, 'EVENT_COUNT');
  }

  async variantCounts(experiment: ExperimentRow): Promise<VariantCountRow[]> {
    const rows = await this.db
      .prepare(SQL.RESULT_COUNTS)
      .bind(experiment.goalName, experiment.id)
      .all<{ id: string; exposures: number; conversions: number }>();
    return rows.results.map((row) => ({ id: row.id, exposures: row.exposures, conversions: row.conversions }));
  }

  /** 模擬トラフィックの割当と転換を、まとめて保存する。各文はイベント数が上限未満のときだけ挿入する。 */
  async saveSimulation(
    experiment: ExperimentRow,
    limit: number,
    assignments: ReadonlyArray<{ id: string; visitorId: string; variantId: string; assignedAt: string }>,
    conversions: ReadonlyArray<{ id: string; visitorId: string; goalName: string; convertedAt: string }>,
  ): Promise<void> {
    const statements = [
      ...assignments.map((item) =>
        this.db
          .prepare(SQL.ASSIGNMENT_INSERT_IF_UNDER_LIMIT)
          .bind(
            item.id,
            experiment.id,
            experiment.ownerSessionId,
            item.visitorId,
            item.variantId,
            item.assignedAt,
            experiment.id,
            experiment.id,
            limit,
          ),
      ),
      ...conversions.map((item) =>
        this.db
          .prepare(SQL.CONVERSION_INSERT_BY_VISITOR_IF_UNDER_LIMIT)
          .bind(item.id, item.goalName, item.convertedAt, experiment.id, item.visitorId, experiment.id, experiment.id, limit),
      ),
    ];
    for (let start = 0; start < statements.length; start += SIMULATION_BATCH_SIZE) {
      await this.db.batch(statements.slice(start, start + SIMULATION_BATCH_SIZE));
    }
  }

  private async loadAggregate(experiment: ExperimentRow): Promise<ExperimentAggregate> {
    const variantRows = await this.db
      .prepare(SQL.VARIANT_SELECT_BY_EXPERIMENT)
      .bind(experiment.id)
      .all<Record<string, unknown>>();
    const eventCount = await this.eventCount(experiment.id);
    return {
      experiment,
      variants: variantRows.results.map(toVariantRow),
      eventCount,
    };
  }
}

/** 1 回の batch に入れる文の数の上限（D1 の制限に合わせて小さく保つ）。 */
const SIMULATION_BATCH_SIZE = 50;

function toExperimentRow(row: Record<string, unknown>): ExperimentRow {
  const status = row['status'];
  if (typeof status !== 'string' || !STATUS_VALUES.includes(status)) {
    throw new Error(REPOSITORY_MESSAGE.INVALID_STORED_STATUS(String(row['id']), status));
  }
  return {
    id: requireString(row, 'id'),
    ownerSessionId: requireString(row, 'owner_session_id'),
    publicKey: requireString(row, 'public_key'),
    name: requireString(row, 'name'),
    status: status as ExperimentStatus,
    goalName: requireString(row, 'goal_name'),
    minSample: requireNumber(row, 'min_sample'),
    createdAt: requireString(row, 'created_at'),
  };
}

function toVariantRow(row: Record<string, unknown>): VariantRow {
  const rawPayload = requireString(row, 'payload_json');
  let payload: VariantPayload;
  try {
    payload = JSON.parse(rawPayload) as VariantPayload;
  } catch (error) {
    throw new Error(REPOSITORY_MESSAGE.INVALID_STORED_PAYLOAD(String(row['id']), String(error)));
  }
  return {
    id: requireString(row, 'id'),
    experimentId: requireString(row, 'experiment_id'),
    key: requireString(row, 'key'),
    label: requireString(row, 'label'),
    weight: requireNumber(row, 'weight'),
    payload,
    position: requireNumber(row, 'position'),
  };
}

function requireString(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') {
    throw new Error(REPOSITORY_MESSAGE.INVALID_STORED_COLUMN(column, value));
  }
  return value;
}

function requireNumber(row: Record<string, unknown>, column: string): number {
  const value = row[column];
  if (typeof value !== 'number') {
    throw new Error(REPOSITORY_MESSAGE.INVALID_STORED_COLUMN(column, value));
  }
  return value;
}

function requireCountRow(row: { n: number } | null, query: string): number {
  if (row === null || typeof row.n !== 'number') {
    throw new Error(REPOSITORY_MESSAGE.COUNT_READ_FAILED(query));
  }
  return row.n;
}
