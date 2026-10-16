# ER 図（実装済みのスキーマ）

本書は `migrations/0001_init.sql` のスキーマ（D1 / SQLite）を図にしたものです。日次リセット（JST 03:00）で全行を削除します。

```mermaid
erDiagram
    experiments ||--o{ variants : "持つ（2〜4 件）"
    experiments ||--o{ assignments : "割り当てる"
    variants ||--o{ assignments : "割り当てられる"
    assignments ||--o{ conversions : "転換を記録する"

    experiments {
        TEXT id PK
        TEXT owner_session_id "所有者（Cookie ab_session）"
        TEXT public_key UK "32 文字・計測 API の識別子"
        TEXT name
        TEXT status "draft / running / paused / capped"
        TEXT goal_name
        INTEGER min_sample "1 以上"
        TEXT created_at
    }

    variants {
        TEXT id PK
        TEXT experiment_id FK
        TEXT owner_session_id
        TEXT key "UK（experiment_id, key）"
        TEXT label
        INTEGER weight "0 以上・配分率"
        TEXT payload_json "既定 {}"
        INTEGER position "UK（experiment_id, position）"
    }

    assignments {
        TEXT id PK
        TEXT experiment_id FK
        TEXT owner_session_id
        TEXT visitor_id "UK（experiment_id, visitor_id）"
        TEXT variant_id FK
        TEXT assigned_at
    }

    conversions {
        TEXT id PK
        TEXT assignment_id FK
        TEXT owner_session_id
        TEXT goal_name "UK（assignment_id, goal_name）"
        TEXT converted_at
    }
```

## 関係と制約

| 関係 | 内容 |
|---|---|
| experiments → variants | 1 実験に 2〜4 件のバリアント。`(experiment_id, key)` と `(experiment_id, position)` は一意 |
| experiments → assignments | 1 実験の中で、訪問者 ID ごとに 1 件の割当。`(experiment_id, visitor_id)` は一意 |
| variants → assignments | 割当は 1 つのバリアントを指す |
| assignments → conversions | 割当ごとに、ゴール名ごとに 1 件まで。`(assignment_id, goal_name)` は一意 |

## 設計上の要点

- すべてのテーブルに `owner_session_id` を持たせ、ダッシュボードのクエリを所有者で絞り込みます。計測 API はセッションを持たないため、公開キー（`experiments.public_key`）で実験を引きます。
- `experiments.public_key` は 32 文字で一意です（`CHECK (length(public_key) = 32)`）。
- 露出数は `assignments` の件数、転換数は `conversions` の件数で集計します。
- 上限（1 実験あたり 10,000 件）は、`assignments` の件数と `conversions` の件数の合計で判定します。
