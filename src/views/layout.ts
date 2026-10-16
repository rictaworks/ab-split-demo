import { FONT_AWESOME, GA4, ROUTE } from '../config/http';
import { SITE, UI_TEXT } from '../config/ui';
import { escapeHtml } from './html';
import { STYLES } from './styles';
import { CLIENT_SCRIPT } from './client';

export interface LayoutOptions {
  readonly title: string;
  readonly ga4MeasurementId: string;
  /** 「← デモ一覧へ」の遷移先（環境変数 DEMO_LIST_URL を検証済みの値）。 */
  readonly demoListUrl: string;
  /** 応答の CSP と同じ nonce。インラインの script / style に付ける。 */
  readonly nonce: string;
  readonly body: string;
  readonly messages?: Record<string, string>;
  readonly withClient?: boolean;
}

/**
 * 全画面の共通レイアウト。必須 4 要素（アンバーバナー、戻るリンク、右下の相談ボタン、/legal へのリンク）と
 * GA4 タグを必ず含める（CLAUDE.md の全デモ共通要件）。
 */
export function renderLayout(options: LayoutOptions): string {
  const messages = escapeHtml(JSON.stringify(options.messages ?? {}));
  const nonce = escapeHtml(options.nonce);
  const client = options.withClient === true ? `<script nonce="${nonce}">${CLIENT_SCRIPT}</script>` : '';
  return [
    '<!doctype html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(options.title)} | ${escapeHtml(SITE.SERVICE_NAME)}</title>`,
    `<link rel="stylesheet" href="${FONT_AWESOME.STYLESHEET_URL}">`,
    `<style nonce="${nonce}">${STYLES}</style>`,
    `<script async src="${GA4.SCRIPT_URL}${escapeHtml(options.ga4MeasurementId)}"></script>`,
    `<script nonce="${nonce}">`,
    'window.dataLayer = window.dataLayer || [];',
    'function gtag() { window.dataLayer.push(arguments); }',
    'gtag(\'js\', new Date());',
    `gtag('config', '${escapeHtml(options.ga4MeasurementId)}');`,
    '</script>',
    '</head>',
    `<body data-messages="${messages}">`,
    `<div class="${UI_TEXT.banner.className}" role="status">${escapeHtml(UI_TEXT.banner.message)}</div>`,
    '<header class="site-header">',
    `<a class="back-link" href="${escapeHtml(options.demoListUrl)}">${escapeHtml(UI_TEXT.backLink.label)}</a>`,
    `<span>${escapeHtml(SITE.SERVICE_NAME)}</span>`,
    '</header>',
    `<main class="container">${options.body}</main>`,
    '<footer class="site-footer">',
    `<a href="${ROUTE.LEGAL}">${escapeHtml(UI_TEXT.footer.legalLabel)}</a>`,
    '</footer>',
    `<a class="consult-button" href="${UI_TEXT.consult.href}"><i class="${UI_TEXT.consult.icon}" aria-hidden="true"></i> ${escapeHtml(UI_TEXT.consult.label)}</a>`,
    client,
    '</body>',
    '</html>',
  ].join('\n');
}
