/**
 * 表示ラベルと例外メッセージの文字列。Domain Core 本体には直書きしない。
 */

import { JUDGEMENT, JudgementCode } from './domain';

export const JUDGEMENT_LABEL: Record<JudgementCode, string> = {
  [JUDGEMENT.CONTROL]: '対照',
  [JUDGEMENT.INSUFFICIENT_DATA]: 'データ不足',
  [JUDGEMENT.SIGNIFICANT]: '有意',
  [JUDGEMENT.NOT_SIGNIFICANT]: '有意差なし',
};

/** 実験全体の判定（バリアントが 1 件のみの場合）の表示ラベル。 */
export const NOT_COMPARABLE_LABEL = '比較不能';

/** 例外メッセージに埋め込む項目名。 */
export const FIELD_NAME = {
  PUBLIC_KEY: '公開キー',
  VISITOR_ID: '訪問者 ID',
  GOAL_NAME: 'ゴール名',
  EVENT_COUNT: 'イベント数',
  EXPOSURES: '露出数',
  CONVERSIONS: '転換数',
  VISITOR_COUNT: '訪問者数',
  NAME: '実験名',
  GOAL_NAME_LABEL: 'ゴール名',
  MIN_SAMPLE: '最小サンプル数',
  VARIANTS: 'バリアント',
  VARIANT_KEY: 'バリアントのキー',
  VARIANT_LABEL: 'バリアント名',
  WEIGHT: '配分率',
  PAYLOAD: '表示内容',
  SELECTOR: 'セレクタ',
  TEXT: '文言',
} as const;

/** 例外メッセージ。文脈（入力値）を埋め込み、デバッグで追跡できるようにする。 */
export const ERROR_MESSAGE = {
  EMPTY_STRING: (name: string, actual: unknown): string =>
    `${name} は空でない文字列である必要があります（受け取った値: ${JSON.stringify(actual)}）。`,
  INVALID_COUNT_VALUE: (name: string, actual: unknown): string =>
    `${name} は 0 以上の整数である必要があります（受け取った値: ${JSON.stringify(actual)}）。`,
  INVALID_VARIANT_COUNT: (variantId: string, name: string, actual: unknown): string =>
    `バリアント ${variantId} の${name}は 0 以上の整数である必要があります（受け取った値: ${JSON.stringify(actual)}）。`,
  INVALID_WEIGHT: (variantId: string, weight: unknown): string =>
    `バリアント ${variantId} の配分率は 0 以上の整数である必要があります（受け取った値: ${JSON.stringify(weight)}）。`,
  ZERO_TOTAL_WEIGHT: (experimentId: string): string =>
    `実験 ${experimentId} の配分率の合計が 0 です。配分率を 1 以上にしてください。`,
  NO_VARIANTS: (experimentId: string): string =>
    `実験 ${experimentId} にバリアントがありません。`,
  NO_VARIANTS_FOR_RESULTS: '集計対象のバリアントがありません。',
  INVALID_MIN_SAMPLE: (actual: unknown): string =>
    `最小サンプル数は 1 以上の整数である必要があります（受け取った値: ${JSON.stringify(actual)}）。`,
  CONVERSIONS_EXCEED_EXPOSURES: (variantId: string, exposures: number, conversions: number): string =>
    `バリアント ${variantId} の転換数（${conversions}）が露出数（${exposures}）を超えています。`,
  UNEXPECTED_ASSIGN_DECISION: (experimentId: string, decision: unknown): string =>
    `実験 ${experimentId} の割当結果が想定外です（結果: ${JSON.stringify(decision)}）。`,
  NOT_RUNNING_FOR_SIMULATION: (experimentId: string, status: unknown): string =>
    `実験 ${experimentId} は実行中ではないため模擬トラフィックを実行できません（状態: ${JSON.stringify(status)}）。`,
  MISSING_CONVERSION_RATE: (variantId: string): string =>
    `バリアント ${variantId} の想定転換率が指定されていません。`,
  INVALID_CONVERSION_RATE: (variantId: string, actual: unknown): string =>
    `バリアント ${variantId} の想定転換率は 0 以上 1 以下の数値である必要があります（受け取った値: ${JSON.stringify(actual)}）。`,
  BUCKET_NOT_MAPPED: (bucket: number, total: number): string =>
    `区間番号 ${bucket} に対応するバリアントが見つかりません（配分率の合計: ${total}）。`,
  INVALID_VISITOR_COUNT: (actual: unknown): string =>
    `訪問者数は 1 以上の整数である必要があります（受け取った値: ${JSON.stringify(actual)}）。`,
};

/** 入力検証・状態遷移の拒否理由（API 応答に出す日本語メッセージ）。 */
export const INPUT_MESSAGE = {
  NOT_OBJECT: '本文は JSON オブジェクトで送信してください。',
  UNKNOWN_FIELD: (field: string): string => `未対応の項目 ${field} が含まれています。`,
  REQUIRED_FIELD: (field: string): string => `${field} は必須です。`,
  INVALID_STRING: (field: string, rule: string, actual: unknown): string =>
    `${field} は${rule}で入力してください（受け取った値: ${JSON.stringify(actual)}）。`,
  INVALID_INTEGER: (field: string, rule: string, actual: unknown): string =>
    `${field} は${rule}の整数で入力してください（受け取った値: ${JSON.stringify(actual)}）。`,
  INVALID_NUMBER: (field: string, rule: string, actual: unknown): string =>
    `${field} は${rule}の数値で入力してください（受け取った値: ${JSON.stringify(actual)}）。`,
  INVALID_VARIANT_COUNT: (min: number, max: number, actual: number): string =>
    `バリアントは ${min} 件以上 ${max} 件以下で指定してください（指定件数: ${actual}）。`,
  DUPLICATE_VARIANT_KEY: (key: string): string => `バリアントのキー ${key} が重複しています。`,
  INVALID_PAYLOAD: (key: string, reason: string): string =>
    `バリアント ${key} の表示内容が不正です（${reason}）。`,
  HONEYPOT_FILLED: '入力内容を確認できませんでした。',
  /** 入力規則の説明文。検証メッセージの「〜で入力してください」に埋め込む。 */
  RULE: {
    PUBLIC_KEY: (length: number): string => `${length} 文字の小文字 16 進数`,
    IDENTIFIER: (maxLength: number): string => `${maxLength} 文字以内の英数字・ハイフン・アンダースコア`,
    TRIMMED_TEXT: (maxLength: number): string => `1 文字以上 ${maxLength} 文字以内の文字列`,
    OBJECT: 'オブジェクト',
    RATE_RANGE: '0 以上 1 以下',
    RANGE: (min: number, max: number): string => `${min} 以上 ${max} 以下`,
  },
  CONVERSION_RATE_LABEL: (variantId: string): string => `転換率（${variantId}）`,
  VARIANT_ITEM_LABEL: (index: number): string => `バリアント ${index + 1} 件目`,
  PAYLOAD_LABEL: (key: string): string => `表示内容（${key}）`,
  INVALID_PAYLOAD_COLOR: (key: string, actual: unknown): string =>
    `バリアント ${key} の表示内容が不正です（色は #RRGGBB 形式で指定してください。受け取った値: ${JSON.stringify(actual)}）。`,
  INVALID_PAYLOAD_TEXT: (key: string, label: string, min: number, max: number, actual: unknown): string =>
    `バリアント ${key} の表示内容が不正です（${label}は ${min} 文字以上 ${max} 文字以内で指定してください。受け取った値: ${JSON.stringify(actual)}）。`,
  INVALID_TARGET_STATUS: (actual: unknown): string =>
    `変更先の状態は running または paused のみ指定できます（受け取った値: ${JSON.stringify(actual)}）。`,
  INVALID_VISITOR_COUNT_RANGE: (max: number): string =>
    `訪問者数は 1 以上 ${max} 以下の整数で指定してください。`,
};

/** 状態遷移の拒否時の例外メッセージを追加する。 */
export const TRANSITION_MESSAGE = {
  DENIED: (experimentId: string, from: string, to: string, reason: string): string =>
    `実験 ${experimentId} を ${from} から ${to} へ変更できません（理由: ${reason}）。`,
};

/** 業務処理の拒否・未検出の応答メッセージ（API の error.message に出す）。 */
export const SERVICE_MESSAGE = {
  BATCH_RESULT_MISSING: (experimentId: string): string =>
    `実験 ${experimentId} の保存結果を取得できませんでした。`,
  INVALID_CSP_NONCE: 'CSP の nonce が空、または使えない文字を含んでいます。',
  EMPTY_FINGERPRINT_INPUT: 'ログ用の識別子を作る入力が空です。',
  EXPERIMENT_LIMIT_REACHED: (limit: number): string =>
    `1 セッションで作成できる実験は ${limit} 件までです。既存の実験を確認してください。`,
  EXPERIMENT_NOT_FOUND: '実験が見つかりません。',
  VARIANT_COUNT_FIXED: 'バリアントの件数は作成後に変更できません。',
  VARIANT_KEYS_LOCKED: '実行開始後はバリアントのキーを変更できません。',
  ZERO_WEIGHT_WHILE_ACTIVE: '実行中・停止中の実験では、配分率の合計を 1 以上にしてください。',
  NOT_RUNNING_FOR_SIMULATION: '模擬トラフィックは実行中の実験のみ実行できます。',
  CONCURRENT_UPDATE: '別の操作で状態が変わりました。画面を更新して、もう一度操作してください。',
  SIMULATION_INPUT_REJECTED: (reason: string): string => `模擬トラフィックの入力が不正です（${reason}）。`,
  UNKNOWN_ROUTE: '指定されたページが見つかりません。',
  METHOD_NOT_ALLOWED: (method: string): string => `この経路では ${method} を利用できません。`,
  INVALID_JSON: '本文の JSON を解析できませんでした。',
  UNSUPPORTED_MEDIA_TYPE: 'Content-Type は application/json で送信してください。',
  CONFIGURATION_ERROR: (name: string): string => `サーバーの設定 ${name} が未設定または不正です。`,
  INTERNAL_ERROR: 'サーバー内部でエラーが発生しました。時間をおいて再度お試しください。',
  INVALID_GA4_ID: 'GA4 の測定 ID の形式が不正です。',
  UNEXPECTED_CRON: (cron: string): string => `想定外の Cron 式のため、日次リセットを実行しません（受け取った式: ${cron}）。`,
  MISSING_RESULT_ROW: (variantId: string, experimentId: string): string =>
    `バリアント ${variantId} の集計結果がありません（実験 ${experimentId}）。`,
  MISSING_ASSIGNED_VARIANT: (variantId: string, experimentId: string): string =>
    `割当のバリアント ${variantId} が実験 ${experimentId} にありません。`,
  READ_BACK_FAILED: (experimentId: string, visitorId: string): string =>
    `割当の保存後に読み出せません（実験 ${experimentId}、訪問者 ${visitorId}）。`,
  INVALID_STORED_STATUS: (experimentId: string, status: unknown): string =>
    `実験の状態が不正です（実験 ${experimentId}、状態: ${JSON.stringify(status)}）。`,
  INVALID_STORED_PAYLOAD: (variantId: string, cause: string): string =>
    `バリアントの表示内容を解析できません（バリアント ${variantId}）: ${cause}`,
  INVALID_STORED_COLUMN: (column: string, actual: unknown): string =>
    `列 ${column} の型が想定と異なります（受け取った値: ${JSON.stringify(actual)}）。`,
  COUNT_READ_FAILED: (query: string): string => `件数の取得に失敗しました（問い合わせ: ${query}）。`,
};

/** リポジトリで保存データを検証したときの例外メッセージ。 */
export const REPOSITORY_MESSAGE = {
  READ_BACK_FAILED: SERVICE_MESSAGE.READ_BACK_FAILED,
  INVALID_STORED_STATUS: SERVICE_MESSAGE.INVALID_STORED_STATUS,
  INVALID_STORED_PAYLOAD: SERVICE_MESSAGE.INVALID_STORED_PAYLOAD,
  INVALID_STORED_COLUMN: SERVICE_MESSAGE.INVALID_STORED_COLUMN,
  COUNT_READ_FAILED: SERVICE_MESSAGE.COUNT_READ_FAILED,
  BATCH_RESULT_MISSING: SERVICE_MESSAGE.BATCH_RESULT_MISSING,
};
