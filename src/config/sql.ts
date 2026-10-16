/**
 * SQL 文の正。値はすべてバインドパラメータで渡し、文字列連結で組み立てない。
 * owner_session_id は全テーブルに付与し、所有者による絞り込みを行う。
 */

/**
 * 1 実験あたりのイベント数（割当 + 転換）を数える式。バインド順は（実験 ID, 実験 ID）。
 * 条件付き挿入の WHERE に埋め込み、件数の判定と挿入を 1 文で行う（並行リクエストで上限を超えない）。
 */
const EVENT_COUNT_EXPRESSION =
  '(SELECT COUNT(*) FROM assignments WHERE experiment_id = ?) + ' +
  '(SELECT COUNT(*) FROM conversions c JOIN assignments a ON a.id = c.assignment_id WHERE a.experiment_id = ?)';

export const SQL = {
  /**
   * 実験数が上限未満のときだけ挿入する。バインド順は
   * （id, owner, public_key, name, status, goal_name, min_sample, created_at, owner, 上限）。
   */
  EXPERIMENT_INSERT_IF_UNDER_LIMIT:
    'INSERT INTO experiments (id, owner_session_id, public_key, name, status, goal_name, min_sample, created_at) ' +
    'SELECT ?, ?, ?, ?, ?, ?, ?, ? ' +
    'WHERE (SELECT COUNT(*) FROM experiments WHERE owner_session_id = ?) < ?',
  /** 親の実験が挿入されたときだけバリアントを挿入する（上限超過時は 0 件になる）。 */
  VARIANT_INSERT_IF_EXPERIMENT_EXISTS:
    'INSERT INTO variants (id, experiment_id, owner_session_id, key, label, weight, payload_json, position) ' +
    'SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM experiments WHERE id = ? AND owner_session_id = ?)',
  EXPERIMENT_SELECT_OWNED:
    'SELECT id, owner_session_id, public_key, name, status, goal_name, min_sample, created_at ' +
    'FROM experiments WHERE id = ? AND owner_session_id = ?',
  EXPERIMENT_SELECT_BY_PUBLIC_KEY:
    'SELECT id, owner_session_id, public_key, name, status, goal_name, min_sample, created_at ' +
    'FROM experiments WHERE public_key = ?',
  EXPERIMENT_LIST_BY_OWNER:
    'SELECT id, owner_session_id, public_key, name, status, goal_name, min_sample, created_at ' +
    'FROM experiments WHERE owner_session_id = ? ORDER BY created_at, id',
  EXPERIMENT_COUNT_BY_OWNER: 'SELECT COUNT(*) AS n FROM experiments WHERE owner_session_id = ?',
  EXPERIMENT_UPDATE_FIELDS:
    'UPDATE experiments SET name = ?, goal_name = ?, min_sample = ? WHERE id = ? AND owner_session_id = ?',
  EXPERIMENT_SET_STATUS: 'UPDATE experiments SET status = ? WHERE id = ? AND owner_session_id = ? AND status = ?',
  VARIANT_SELECT_BY_EXPERIMENT:
    'SELECT id, experiment_id, key, label, weight, payload_json, position FROM variants ' +
    'WHERE experiment_id = ? ORDER BY position',
  VARIANT_UPDATE:
    'UPDATE variants SET key = ?, label = ?, weight = ?, payload_json = ? WHERE id = ? AND owner_session_id = ?',
  EVENT_COUNT:
    'SELECT (SELECT COUNT(*) FROM assignments WHERE experiment_id = ?) + ' +
    '(SELECT COUNT(*) FROM conversions c JOIN assignments a ON a.id = c.assignment_id ' +
    'WHERE a.experiment_id = ?) AS n',
  ASSIGNMENT_SELECT: 'SELECT id, variant_id FROM assignments WHERE experiment_id = ? AND visitor_id = ?',
  /**
   * イベント数が上限未満のときだけ割当を挿入する（既存の訪問者は無視）。
   * バインド順は（id, 実験 ID, owner, 訪問者 ID, バリアント ID, 時刻, 実験 ID, 実験 ID, 上限）。
   */
  ASSIGNMENT_INSERT_IF_UNDER_LIMIT:
    'INSERT OR IGNORE INTO assignments (id, experiment_id, owner_session_id, visitor_id, variant_id, assigned_at) ' +
    `SELECT ?, ?, ?, ?, ?, ? WHERE (${EVENT_COUNT_EXPRESSION}) < ?`,
  CONVERSION_GOALS_BY_ASSIGNMENT: 'SELECT goal_name FROM conversions WHERE assignment_id = ?',
  /**
   * イベント数が上限未満のときだけ転換を挿入する（（割当, ゴール）が既にあれば無視）。
   * バインド順は（id, 割当 ID, owner, ゴール, 時刻, 実験 ID, 実験 ID, 上限）。
   */
  CONVERSION_INSERT_IF_UNDER_LIMIT:
    'INSERT OR IGNORE INTO conversions (id, assignment_id, owner_session_id, goal_name, converted_at) ' +
    `SELECT ?, ?, ?, ?, ? WHERE (${EVENT_COUNT_EXPRESSION}) < ?`,
  /** 模擬用。訪問者 ID から割当を引いて挿入する。バインド順は（id, ゴール, 時刻, 実験 ID, 訪問者 ID, 実験 ID, 実験 ID, 上限）。 */
  CONVERSION_INSERT_BY_VISITOR_IF_UNDER_LIMIT:
    'INSERT OR IGNORE INTO conversions (id, assignment_id, owner_session_id, goal_name, converted_at) ' +
    'SELECT ?, a.id, a.owner_session_id, ?, ? FROM assignments a WHERE a.experiment_id = ? AND a.visitor_id = ? ' +
    `AND (${EVENT_COUNT_EXPRESSION}) < ?`,
  RESULT_COUNTS:
    'SELECT v.id AS id, ' +
    '(SELECT COUNT(*) FROM assignments a WHERE a.variant_id = v.id) AS exposures, ' +
    '(SELECT COUNT(*) FROM conversions c JOIN assignments a ON a.id = c.assignment_id ' +
    'WHERE a.variant_id = v.id AND c.goal_name = ?) AS conversions ' +
    'FROM variants v WHERE v.experiment_id = ? ORDER BY v.position',
  /** 日次リセット。子テーブルから順に削除する。 */
  DELETE_CONVERSIONS: 'DELETE FROM conversions',
  DELETE_ASSIGNMENTS: 'DELETE FROM assignments',
  DELETE_VARIANTS: 'DELETE FROM variants',
  DELETE_EXPERIMENTS: 'DELETE FROM experiments',
} as const;
