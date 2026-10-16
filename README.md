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

## 認証

自動ログイン：なし（デモ版）。ログインは使わず、Cookie `ab_session` で、そのブラウザが作った実験だけを表示・操作します。

## ページ一覧

| ページ名 | URL |
|---|---|
| 実験一覧 | [https://ab-split-demo.rictaworks.jp/](https://ab-split-demo.rictaworks.jp/) |
| 実験の詳細・結果 | `https://ab-split-demo.rictaworks.jp/experiments/:id` |
| 法的表記 | [https://ab-split-demo.rictaworks.jp/legal](https://ab-split-demo.rictaworks.jp/legal) |
| 概要（LP） | [https://ab-split-demo.rictaworks.jp/lp](https://ab-split-demo.rictaworks.jp/lp) |
| マニュアル | [https://ab-split-demo.rictaworks.jp/manual](https://ab-split-demo.rictaworks.jp/manual) |

## API 一覧

エンドポイントの詳細は [SPEC/api.md](SPEC/api.md) を参照してください。

| タイトル | エンドポイント |
|---|---|
| 実験一覧 | `GET /api/experiments` |
| 実験の作成 | `POST /api/experiments` |
| 実験の取得 | `GET /api/experiments/:id` |
| 実験の更新 | `PUT /api/experiments/:id` |
| 状態の変更 | `POST /api/experiments/:id/status` |
| 擬似トラフィック | `POST /api/experiments/:id/simulate` |
| 結果の取得 | `GET /api/experiments/:id/results` |
| 割当 | `GET /t/:publicKey/assign` |
| 転換の記録 | `POST /t/:publicKey/convert` |
| スニペット | `GET /snippet.js` |

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
