-- ab-split-demo: 初期スキーマ（D1 / SQLite）
-- 日次リセット（JST 03:00）で全行を削除する。owner_session_id は全テーブルに付与する。

CREATE TABLE experiments (
  id TEXT PRIMARY KEY,
  owner_session_id TEXT NOT NULL,
  public_key TEXT NOT NULL UNIQUE CHECK (length(public_key) = 32),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'running', 'paused', 'capped')),
  goal_name TEXT NOT NULL,
  min_sample INTEGER NOT NULL CHECK (min_sample >= 1),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_experiments_owner ON experiments (owner_session_id);

CREATE TABLE variants (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiments (id),
  owner_session_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  weight INTEGER NOT NULL CHECK (weight >= 0),
  payload_json TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (experiment_id, key),
  UNIQUE (experiment_id, position)
);

CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiments (id),
  owner_session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  variant_id TEXT NOT NULL REFERENCES variants (id),
  assigned_at TEXT NOT NULL,
  UNIQUE (experiment_id, visitor_id)
);

CREATE INDEX idx_assignments_variant ON assignments (variant_id);

CREATE TABLE conversions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments (id),
  owner_session_id TEXT NOT NULL,
  goal_name TEXT NOT NULL,
  converted_at TEXT NOT NULL,
  UNIQUE (assignment_id, goal_name)
);
