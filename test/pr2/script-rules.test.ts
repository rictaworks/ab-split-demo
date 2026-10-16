import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * PR #2 のユーザーテスト用スクリプト（test/pr2/）の規約検査。
 * 削除系コマンド・秘密情報の直書き・絵文字・日本語の直書き（文字列は config.mjs に置く）を確認する。
 */

const ROOT = join(__dirname, '..', '..');
const DIR = join(ROOT, 'test', 'pr2');
const RUNNER = join(DIR, 'run.mjs');
const CONFIG = join(DIR, 'config.mjs');

const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const JAPANESE_PATTERN = /[぀-ヿ㐀-鿿＀-￯]/;
const DELETE_PATTERNS: readonly RegExp[] = [
  /\brm\s/,
  /\brmdir\b/,
  /\bunlink\b/,
  /git\s+clean/,
  /-delete\b/,
  /--delete\b/,
  /\bDELETE\b/,
  /method\s*:\s*['"]DELETE['"]/i,
];
const SECRET_LITERAL_PATTERN = /(password|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]+['"]/i;

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** コメントを除いたコードだけを検査対象にする（src の規約検査と同じ扱い）。 */
function codeOnly(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('PR #2 ユーザーテストスクリプトの配置', () => {
  it('test/pr2/run.mjs が存在する', () => {
    expect(existsSync(RUNNER)).toBe(true);
  });

  it('test/pr2/config.mjs が存在する', () => {
    expect(existsSync(CONFIG)).toBe(true);
  });
});

describe('PR #2 ユーザーテストスクリプトの規約（CLAUDE.md）', () => {
  const files = [RUNNER, CONFIG];

  it.each(files)('%s に削除系コマンドや DELETE 操作が無い', (path) => {
    const code = read(path);
    for (const pattern of DELETE_PATTERNS) {
      expect(pattern.test(code)).toBe(false);
    }
  });

  it.each(files)('%s に絵文字が無い', (path) => {
    expect(EMOJI_PATTERN.test(read(path))).toBe(false);
  });

  it.each(files)('%s に秘密情報の直書きが無い', (path) => {
    expect(SECRET_LITERAL_PATTERN.test(read(path))).toBe(false);
  });

  it.each(files)('%s は .env を読まない', (path) => {
    const code = read(path);
    expect(/['"`]\.env['"`]/.test(code)).toBe(false);
    expect(/dotenv/.test(code)).toBe(false);
  });

  it('run.mjs に日本語の文字列が直書きされていない（文字列は config.mjs に置く）', () => {
    expect(JAPANESE_PATTERN.test(codeOnly(RUNNER))).toBe(false);
  });

  it('run.mjs は接続先を環境変数 BASE_URL から取り、本番のホストを対象にしない設定を読む', () => {
    const code = read(RUNNER);
    expect(code).toMatch(/process\.env\.BASE_URL/);
    expect(code).toMatch(/ALLOWED_HOSTS/);
  });

  it('config.mjs に必須 4 要素の文言と GA4 の検査条件が揃っている', () => {
    const code = read(CONFIG);
    expect(code).toMatch(/demo-banner/);
    expect(code).toMatch(/← デモ一覧へ/);
    expect(code).toMatch(/ご相談はこちら/);
    expect(code).toMatch(/\/legal/);
    expect(code).toMatch(/gtag\/js/);
    expect(code).toMatch(/consult-button/);
  });
});

describe('PR #2 ユーザーテストスクリプトの仕様追従（低-4）', () => {
  it('戻るリンクの href を固定値 "/" にしない（DEMO_LIST_URL の値で検査する）', () => {
    const config = read(CONFIG);
    expect(config).not.toContain(`BACK_LINK_HREF: 'href="/"'`);
    expect(config).toMatch(/DEMO_LIST_URL/);
  });

  it('run.mjs は環境変数 DEMO_LIST_URL を読み、未設定は既定値で補わず明示的に失敗する', () => {
    const code = read(RUNNER);
    expect(code).toMatch(/process\.env\[CONFIG\.DEMO_LIST_URL_ENV\]|process\.env\.DEMO_LIST_URL/);
    expect(code).toMatch(/DEMO_LIST_URL_MISSING/);
    expect(read(CONFIG)).not.toMatch(/DEFAULT_DEMO_LIST_URL/);
  });

  it('バリアント数は作成時に 3 件で作り、作成後の件数変更（PUT）は 409 で拒否される手順にする', () => {
    const code = read(RUNNER);
    const config = read(CONFIG);
    expect(code).toMatch(/variantBody\(E\.VARIANT_C/);
    expect(code).toMatch(/response\.status === 409/);
    expect(config).toMatch(/VARIANT_COUNT_FIXED/);
    expect(config).not.toMatch(/ADD_VARIANT_STATUS/);
    expect(config).not.toMatch(/ADD_VARIANT_COUNT/);
    expect(config).not.toContain('バリアントが 3 件に増えている');
  });
});
