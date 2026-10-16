# ab-split-demo

ウェブページの A/B テストを「実験作成 → 訪問者への割当 → 転換記録 → 結果の統計判定」まで体験できる展示デモです（デモ版）。

> **デモ版です。データは毎日 JST 03:00 にすべて削除されます。本番環境ではありません。**

- 公開 URL：https://ab-split-demo.rictaworks.jp/
- 仕様：[requirements.md](requirements.md)
- 開発の規約：[CLAUDE.md](CLAUDE.md)

## 実装している機能

| 機能 | 内容 |
|---|---|
| 実験管理 | 実験の作成・編集・開始・停止。1 実験につきバリアント 2〜4 件と配分率を設定する |
| 割当 API | 公開キーで実験を識別し、訪問者 ID にバリアントを決定的に割り当てる |
| 転換 API | 割当済みの訪問者の転換（ゴール達成）を記録する |
| 結果表示 | バリアント別の露出数・転換数・転換率・リフト・統計判定 |
| 埋め込みスニペット | 任意のページに貼る JS。割当結果に従い、指定した要素の文言・色を差し替える |
| トラフィック模擬 | 展示用に擬似訪問者を生成し、埋め込みなしで結果画面を確認できる |

### 上限

- 1 実験あたりの受付イベント数は 10,000 件です。上限に達すると、割当は既定のバリアント（対照）に固定され、記録は止まります。
- 1 セッションあたりの実験数は 5 件までです。

### 個人情報

氏名・メールアドレスなどの個人情報は保持しません。訪問者 ID は、スニペットがブラウザ内で生成する不透明な乱数です。

## 画面と経路

| 経路 | 内容 |
|---|---|
| `/` | 実験一覧 |
| `/experiments/:id` | 実験の詳細・結果 |
| `/legal` | 法的表記（デモ版の注意・運営者・連絡先・Cookie・データ削除） |
| `/snippet.js` | 埋め込み用スニペット |
| `/api/experiments` ほか | 管理用 API（実験の作成・更新・状態変更・模擬・結果取得） |
| `/t/:publicKey/assign` | 割当 API |
| `/t/:publicKey/convert` | 転換 API |

すべての画面に、アンバーバナー（デモ版の注意）、「← デモ一覧へ」、右下固定の「ご相談はこちら」を表示します。GA4 タグ（`G-C04W1XKS16`）を全画面に入れています。

## 構成

- Cloudflare Workers（API・計測・画面の描画）
- D1（SQLite）：データ保存。マイグレーションは `migrations/`
- Cron Triggers：JST 03:00（UTC 18:00）に全テーブルを削除（日次リセット）

## ローカルで動かす

```bash
npm install
npm run db:migrate:local
npm run dev
```

`GA4_MEASUREMENT_ID` と `DEMO_LIST_URL` は、ローカルでは `.dev.vars` に書きます（コミットしません）。キー名は `.env.example` を正とします。

## テスト・型検査

```bash
npm test
npm run typecheck
```

## デプロイ

```bash
npm run deploy
```

本番では、次の 2 つを Secret として登録します。

```bash
npx wrangler secret put GA4_MEASUREMENT_ID   # 値: G-C04W1XKS16
npx wrangler secret put DEMO_LIST_URL        # 値: https://rictaworks.jp/#demos
```

`wrangler.toml` の `[[routes]]`（`custom_domain = true`）で `ab-split-demo.rictaworks.jp` を割り当てます。
