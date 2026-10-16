# シーケンス図（実装済み）

本書は、主要な処理の、部品どうしのやり取りを時系列で示します。図は Mermaid で書いています。

## 1. 割り当て（`GET /t/:publicKey/assign`）

```mermaid
sequenceDiagram
    autonumber
    participant V as 訪問者のブラウザ
    participant W as Worker（router）
    participant S as ExperimentService
    participant R as ExperimentRepository
    participant D as D1
    participant C as assign（純粋関数）

    V->>W: GET /t/{publicKey}/assign?visitor_id=...
    W->>S: assignVariant(publicKey, visitorId)
    S->>R: findAggregate(publicKey)
    R->>D: SELECT experiments / variants / 件数
    D-->>R: 実験・バリアント・件数
    R-->>S: ExperimentAggregate
    alt 実験が無い、または running でも capped でもない
        S-->>W: 既定表示
    else 上限到達、または capped
        S-->>W: 既定のバリアント（保存しない）
    else 保存済みの割当がある
        S->>R: findAssignment(experimentId, visitorId)
        R-->>S: 保存済みの割当
    else 未割当
        S->>C: assign(input)
        C-->>S: バリアント（累積区間で決定）
        S->>R: saveAssignment(...)
        R->>D: INSERT assignments
        opt 件数が上限に達した
            S->>R: 実験を capped に更新
        end
    end
    S-->>W: バリアント
    W-->>V: JSON
```

## 2. 転換（`POST /t/:publicKey/convert`）

```mermaid
sequenceDiagram
    autonumber
    participant V as 訪問者のブラウザ
    participant W as Worker（router）
    participant S as ExperimentService
    participant R as ExperimentRepository
    participant D as D1
    participant C as convert（純粋関数）

    V->>W: POST /t/{publicKey}/convert {visitorId, goalName}
    W->>S: recordConversion(publicKey, input)
    S->>R: findAggregate(publicKey)
    R-->>S: ExperimentAggregate
    S->>S: 上限到達なら capped に更新
    alt ゴール名が実験と一致しない
        S-->>W: 記録しない
    else 一致する
        S->>R: findAssignment(experimentId, visitorId)
        R-->>S: 割当（無ければ null）
        S->>R: recordedGoals(assignmentId)
        R-->>S: 記録済みのゴール名
        S->>C: convert(input)
        C-->>S: 記録する／しない（理由）
        opt 記録する
            S->>R: saveConversion(...)
            R->>D: INSERT conversions
        end
    end
    S-->>W: 成否 ok（true または false）
    W-->>V: 200 { ok }（理由は返さない）
```

## 3. 結果の表示（`GET /api/experiments/:id/results`）

```mermaid
sequenceDiagram
    autonumber
    participant O as 運営者のブラウザ
    participant W as Worker（router）
    participant S as ExperimentService
    participant R as ExperimentRepository
    participant D as D1
    participant Q as summarizeResults（純粋関数）
    participant T as twoProportionZTest（純粋関数）

    O->>W: GET /api/experiments/{id}/results（Cookie ab_session）
    W->>S: getResults(ownerSessionId, id)
    S->>R: 所有者の実験を取得
    R->>D: SELECT（所有者で絞り込み）
    D-->>R: 実験
    S->>R: バリアント別の露出数・転換数
    R->>D: SELECT COUNT（assignments・conversions）
    D-->>R: 件数
    S->>Q: summarizeResults(input)
    Q->>T: 対照との 2 標本比率検定
    T-->>Q: z・p 値
    Q-->>S: 転換率・リフト・統計判定
    S-->>W: 結果
    W-->>O: JSON
```

> 注：上の図は処理の順序を示します。応答コードは `src/config/http.ts` の定数が正です。
