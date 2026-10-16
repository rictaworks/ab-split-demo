# クラス図（実装済み）

本書は、主要なクラスと関数（モジュール）の関係を示します。Domain Core（`src/core/`）は HTTP 層から分離した純粋関数です。図は Mermaid で書いています。

```mermaid
classDiagram
    direction LR

    class ExperimentService {
        +createExperiment(owner, input)
        +updateExperiment(owner, id, input)
        +changeStatus(owner, id, target)
        +simulateTraffic(owner, id, input)
        +getResults(owner, id)
        +assignVariant(publicKey, visitorId)
        +recordConversion(publicKey, input)
    }

    class ExperimentRepository {
        -db: D1Like
        +findAggregate(id)
        +findAssignment(experimentId, visitorId)
        +recordedGoals(assignmentId)
        +saveAssignment(...)
        +saveConversion(...)
    }

    class D1Like {
        <<interface>>
        +prepare(sql)
    }

    class AppError {
        <<abstract>>
        +code
        +status
    }
    class NotFoundError
    class ConflictError
    class ConfigurationError

    class DomainCoreError
    class ValidationError

    class assign {
        <<function>>
        +assign(input) AssignResult
    }
    class convert {
        <<function>>
        +convert(input) ConvertResult
    }
    class summarizeResults {
        <<function>>
        +summarizeResults(input) ResultsSummary
    }
    class simulate {
        <<function>>
        +simulate(input) SimulateResult
    }
    class decideTransition {
        <<function>>
        +decideTransition(input) TransitionDecision
    }
    class twoProportionZTest {
        <<function>>
        +twoProportionZTest(...) TwoProportionResult
    }
    class parseExperimentInput {
        <<function>>
        +parseExperimentInput(raw) ExperimentInput
    }

    ExperimentService --> ExperimentRepository : 永続化
    ExperimentRepository --> D1Like : 使う
    ExperimentService --> assign : 割当
    ExperimentService --> convert : 転換
    ExperimentService --> summarizeResults : 集計
    ExperimentService --> simulate : 模擬
    ExperimentService --> decideTransition : 状態遷移
    summarizeResults --> twoProportionZTest : 統計判定
    ExperimentService --> parseExperimentInput : 入力検証

    AppError <|-- NotFoundError
    AppError <|-- ConflictError
    AppError <|-- ConfigurationError
    DomainCoreError <|-- ValidationError
```

## 要点

- `ExperimentService` が唯一の入口で、Domain Core の関数を組み合わせ、`ExperimentRepository` に保存します。
- `assign`・`convert`・`summarizeResults`・`simulate`・`decideTransition` は、D1 を直接触りません（純粋関数）。
- 例外は、ドメインの例外（`DomainCoreError`・`ValidationError`）と、HTTP に返す例外（`AppError` 系）に分けています。
- 文字列の正は `src/config/` に置いています。
