/**
 * Domain Core が参照する定数。文字列リテラルと数値の正はここに置く。
 * 値を変えるときは、このファイルだけを変更する。
 */

export const EXPERIMENT_STATUS = {
  DRAFT: 'draft',
  RUNNING: 'running',
  PAUSED: 'paused',
  CAPPED: 'capped',
} as const;

export type ExperimentStatus = (typeof EXPERIMENT_STATUS)[keyof typeof EXPERIMENT_STATUS];

/** assign の結果がどの経路で決まったかを表す。 */
export const ASSIGN_SOURCE = {
  DEFAULT: 'default',
  CAPPED: 'capped',
  EXISTING: 'existing',
  HASHED: 'hashed',
} as const;

export type AssignSource = (typeof ASSIGN_SOURCE)[keyof typeof ASSIGN_SOURCE];

/** convert が記録しなかった理由、または記録した理由を表す。 */
export const CONVERT_REASON = {
  NOT_FOUND: 'not_found',
  NOT_RUNNING: 'not_running',
  CAPPED: 'capped',
  NO_ASSIGNMENT: 'no_assignment',
  DUPLICATE: 'duplicate',
  RECORDED: 'recorded',
} as const;

export type ConvertReason = (typeof CONVERT_REASON)[keyof typeof CONVERT_REASON];

/** バリアントごとの判定コード。表示用ラベルは messages.ts に置く。比較可否は結果全体の comparable で表す。 */
export const JUDGEMENT = {
  CONTROL: 'control',
  INSUFFICIENT_DATA: 'insufficient_data',
  SIGNIFICANT: 'significant',
  NOT_SIGNIFICANT: 'not_significant',
} as const;

export type JudgementCode = (typeof JUDGEMENT)[keyof typeof JUDGEMENT];

export const EXPERIMENT_LIMITS = {
  /** 1 実験あたりのイベント上限（割当・転換の合計）。 */
  EVENT_LIMIT: 10000,
  /** 1 セッションあたりの実験数上限。 */
  MAX_EXPERIMENTS_PER_SESSION: 5,
  /** 最小サンプル数の既定値。 */
  MIN_SAMPLE_DEFAULT: 30,
} as const;

/** 有意水準。p 値がこの値未満のとき「有意」とする。 */
export const SIGNIFICANCE_LEVEL = 0.05;

export const HASH_SETTINGS = {
  /** FNV-1a 32bit の offset basis。 */
  FNV_OFFSET_BASIS: 0x811c9dc5,
  /** FNV-1a 32bit の prime。 */
  FNV_PRIME: 0x01000193,
  /** 割当の分割数（累積区間は 0 以上 BUCKETS 未満）。 */
  BUCKETS: 10000,
} as const;

/** 状態遷移の判定理由。許可・拒否の根拠をログと例外メッセージに残す。 */
export const TRANSITION_REASON = {
  ALLOWED: 'allowed',
  NOT_ALLOWED_PAIR: 'not_allowed_pair',
  DRAFT_RESTORE_FORBIDDEN: 'draft_restore_forbidden',
  WEIGHT_NOT_POSITIVE: 'weight_not_positive',
  VARIANT_COUNT_TOO_FEW: 'variant_count_too_few',
  LIMIT_NOT_REACHED: 'limit_not_reached',
} as const;

export type TransitionReason = (typeof TRANSITION_REASON)[keyof typeof TRANSITION_REASON];

/** 入力検証の上限と書式。既定値ではなく、ここに無い値は受け付けない。 */
export const INPUT_RULES = {
  NAME_MAX_LENGTH: 50,
  GOAL_NAME_MAX_LENGTH: 40,
  MIN_SAMPLE_MAX: 100000,
  VARIANT_MIN_COUNT: 2,
  VARIANT_MAX_COUNT: 4,
  VARIANT_KEY_MAX_LENGTH: 20,
  VARIANT_LABEL_MAX_LENGTH: 30,
  WEIGHT_MIN: 0,
  WEIGHT_MAX: 100,
  SELECTOR_MAX_LENGTH: 200,
  TEXT_MAX_LENGTH: 200,
  VISITOR_ID_MAX_LENGTH: 64,
  SIMULATE_VISITORS_MAX: 1000,
  PUBLIC_KEY_LENGTH: 32,
  /** 公開キーの書式（小文字 16 進数 32 文字）。 */
  PUBLIC_KEY_PATTERN: /^[0-9a-f]{32}$/,
  /** ゴール名・バリアント ID の書式（英数字・ハイフン・アンダースコア）。 */
  IDENTIFIER_PATTERN: /^[A-Za-z0-9_-]+$/,
  /** 色の書式（#RRGGBB）。 */
  COLOR_PATTERN: /^#[0-9a-fA-F]{6}$/,
} as const;
