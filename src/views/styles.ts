/** 画面の基本スタイル。色はトークンとして :root に置く。 */
export const STYLES = `
:root {
  --color-bg: #f8fafc;
  --color-surface: #ffffff;
  --color-text: #0f172a;
  --color-muted: #475569;
  --color-border: #cbd5e1;
  --color-primary: #1d4ed8;
  --color-amber: #fbbf24;
  --color-amber-text: #451a03;
  --color-danger: #b91c1c;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--color-bg); color: var(--color-text); font-family: system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif; line-height: 1.6; }
.demo-banner { background: var(--color-amber); color: var(--color-amber-text); padding: 8px 16px; font-weight: 600; text-align: center; }
.site-header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--color-surface); border-bottom: 1px solid var(--color-border); }
.back-link { color: var(--color-primary); text-decoration: none; font-weight: 600; }
.container { max-width: 960px; margin: 0 auto; padding: 16px; }
.card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
h1 { font-size: 1.5rem; margin: 8px 0 16px; }
h2 { font-size: 1.15rem; margin: 0 0 12px; }
table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--color-border); vertical-align: top; }
.form-grid { display: grid; gap: 8px 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
label { display: flex; flex-direction: column; gap: 4px; font-size: 0.9rem; color: var(--color-muted); }
input { font: inherit; padding: 6px 8px; border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text); background: var(--color-surface); }
button, .button { font: inherit; padding: 8px 14px; border: none; border-radius: 6px; background: var(--color-primary); color: #ffffff; cursor: pointer; text-decoration: none; display: inline-flex; gap: 6px; align-items: center; }
button.secondary { background: #334155; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #e2e8f0; font-size: 0.85rem; }
.notice { padding: 8px 12px; border-radius: 6px; background: #fef3c7; color: var(--color-amber-text); }
.feedback { min-height: 1.5em; font-weight: 600; }
.feedback.is-error { color: var(--color-danger); }
.honeypot { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
pre { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
.site-footer { padding: 24px 16px 96px; text-align: center; color: var(--color-muted); font-size: 0.9rem; }
.site-footer a { color: var(--color-primary); }
.consult-button { position: fixed; right: 16px; bottom: 16px; z-index: 10; background: var(--color-primary); color: #ffffff; padding: 12px 16px; border-radius: 999px; text-decoration: none; font-weight: 600; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25); }
.legal p { margin: 0 0 12px; }
@media (max-width: 600px) { .container { padding: 12px; } table { font-size: 0.85rem; } .consult-button { right: 12px; bottom: 12px; } }
`;
