# Claude Safety Rules

## 削除系コマンドの禁止（重要）

以下のルールはこのワークスペース内のすべての会話で絶対に守られる：

- Claude はファイルまたはディレクトリを削除するコマンドを一切生成してはならない。
  例：rm, rm -rf, rm *, rmdir, unlink, cache --delete,
      lftp mirror --delete, rsync --delete, git clean -df, find -delete 等。

- 削除が必要な場合でも、Claude は削除コマンドを提案せず、
  「手動で削除してください」といった説明に留めること。

- 削除の推奨・削除操作の自動判断も禁止。

- ssh / lftp / デプロイ系スクリプトを生成する場合でも、
  削除コマンドの生成は禁止。

これらはすべての会話・コード生成に適用される。

## シークレット管理（重要）

- `config/master.key` など機密ファイルを `git add` するコードを生成してはならない
- デプロイスクリプト・セットアップ手順でも同様
- シークレットは必ず環境変数（RAILS_MASTER_KEY 等）で渡すこと
- `.gitignore` への追加を確認する手順を必ずコードに含めること
- 初回コミット前に `git status` でステージング確認を促すこと

---

## プロジェクト指針（ab-split-demo）

このファイルは Claude Code がこのリポジトリで作業するときの指針。要件の正は `requirements.md`。

## プロジェクト概要

ウェブページの A/B テストを「実験作成 → 訪問者への割当 → 転換記録 → 統計判定」まで体験できる展示デモ（デモ版）。AI・外部 API・認証は使わない。

- 配布：Cloudflare Workers（API・計測）＋ Pages（ダッシュボード）＋ D1（SQLite）。Vercel・Railway は使わない。
- 上限：1実験あたりのイベント上限 10,000 件、1セッションあたりの実験数 5 件。
- 日次リセット：JST 03:00（UTC 18:00）に Cron Triggers で全テーブルを削除。
- 公開設定：public。`.claude/` は `.gitignore` により GitHub に載らない（ローカルのみ）。

## 開発フロー（デモ版）

```
issue > setting & coding > security review > add, commit, push > reviewer & pr-checker > merge > user test
```

- `src/**` の変更は必ず PR を作成し、main へ直接 push しない。
- それ以外（ドキュメント・`requirements.md`・`CLAUDE.md`）は main への push を許可する。
- コミット前に必ずセキュリティレビュー（`/security-review`）を通す。
- マージ前に `reviewer` と `pr-checker` を実行する。
- 全 PR のユーザーテストは Claude Desktop の sandbox > Chrome で行い、ログインを要求する。
- デモ版は code-review・audit・security-gate・正式 release・report を省略してよい。
- 本番デプロイは main へのマージで行う（デモ版の構成）。

## AI 役割分担（デモ版）

| フェーズ | 担当モデル |
|---|---|
| 設計 | Opus |
| 初回 Issue 発行 | Sonnet |
| 1次実装 | Haiku |
| 修正 | Sonnet |
| Security Review | Opus |
| reviewer, pr-checker | Sonnet |
| テスト作成・実行 | Haiku |
| コンテンツライティング | Gemini |
| ファクトチェック | GPT |

PR に投稿するときは、フッターにモデル名を記載すること。

## コーディング規約

- TDD を厳守する：plan > red test > coding > green test。
- 日本語版のみ開発する。文章は**ですます調**（B2B・最重要。だである調は禁止）。
- フォールバック禁止。例外処理を明示的に書く。
- デバッグトレースできるようにコードを書く。
- 制御構文・条件構文以外は、クラスまたは関数に書く。グローバル変数は禁止。
- 文字列リテラルは設定ファイルに分離する。ハードコードを検査するテストを書く。
- ネイティブの `alert()` / `confirm()` / `prompt()` は使用禁止。
- 絵文字は使わない。デフォルトアイコンは FontAwesome を使う。
- 環境変数は `.env` を参照する（`.env` はコミットしない。`.env.example` を正とする）。
- 実装は `src/` 以下に置く。開発用スクリプトは `src/` の外に置く。
- Domain Core（割当・転換・集計）は HTTP 層から分離し、純粋関数として実装する。
- 連絡先はメール（info@rictaworks.jp）のみ。個人名は書かない。

## 必須参照

- `requirements.md`：要件の正。
- `DOCS/CRAP.md`・`DOCS/DP.md`・`DOCS/TM.md`：デザイン・設計原則・テストメソッド。
- `.claude/CC.md`・`.claude/OWASP10.md`・`.claude/QC10.md`：コンプライアンス・セキュリティ・品質の基準。

## 全デモ共通要件

- 必須 4 要素：アンバーバナー、「← デモ一覧へ」戻るリンク、右下固定の「ご相談はこちら」ボタン、`/legal` ページ。
- GA4 タグを全画面に入れる。
- 実装完了・本番デプロイ・ユーザーテストの各段階で、上記の有無を機械的に確認する。

## ビルド・テストのコマンド

- テスト: `npm test`（Jest。core・HTTP 統合・規約検査）
- 型検査: `npm run typecheck`
- ローカル実行: `npm run dev`（`wrangler dev`。`GA4_MEASUREMENT_ID` は `.dev.vars` に置く）
- D1 マイグレーション: `npm run db:migrate:local` / `npm run db:migrate:remote`
- デプロイ: `npm run deploy`（`wrangler.toml` の `database_id` を実値に置き換えてから）
- README と SPEC に未実装の機能を書かない。