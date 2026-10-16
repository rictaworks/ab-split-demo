import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');

function listFiles(dir: string, extension: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return listFiles(path, extension);
    }
    return name.endsWith(extension) ? [path] : [];
  });
}

/** コメントを除いたコードだけを検査対象にする。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const SOURCES = listFiles(SRC, '.ts').map((path) => ({
  name: relative(ROOT, path),
  inConfig: relative(SRC, path).startsWith('config'),
  code: stripComments(readFileSync(path, 'utf8')),
}));

const JAPANESE_PATTERN = /[぀-ヿ㐀-鿿＀-￯]/;
const DIALOG_PATTERN = /\b(alert|confirm|prompt)\s*\(/;
const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe('src のハードコード・規約検査（要件 9）', () => {
  it('検査対象の TypeScript ファイルが存在する', () => {
    expect(SOURCES.length).toBeGreaterThan(10);
  });

  it.each(SOURCES.filter((s) => !s.inConfig).map((s) => [s.name, s.code]))(
    '%s に日本語の文言が直書きされていない（文言は src/config に置く）',
    (_name, code) => {
      expect(JAPANESE_PATTERN.test(code as string)).toBe(false);
    },
  );

  it.each(SOURCES.map((s) => [s.name, s.code]))('%s にネイティブのダイアログが無い', (_name, code) => {
    expect(DIALOG_PATTERN.test(code as string)).toBe(false);
  });

  it.each(SOURCES.map((s) => [s.name, s.code]))('%s に絵文字が無い', (_name, code) => {
    expect(EMOJI_PATTERN.test(code as string)).toBe(false);
  });

  it.each(SOURCES.map((s) => [s.name, s.code]))('%s に GA4 の測定 ID が直書きされていない', (_name, code) => {
    expect(/G-[A-Z0-9]{6,}/.test(code as string)).toBe(false);
  });

  it.each(SOURCES.map((s) => [s.name, s.code]))('%s にトップレベルの let / var（グローバル変数）が無い', (_name, code) => {
    expect(/^(let|var)\s/m.test(code as string)).toBe(false);
  });
});

describe('設定ファイルと環境変数（要件 8・9）', () => {
  it('.env.example に GA4 の測定 ID のキー名があり、値は空である', () => {
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
    expect(example).toMatch(/^GA4_MEASUREMENT_ID=\s*$/m);
  });

  it('.env.example に DEMO_LIST_URL のキー名があり、値は空である（URL をコードや例に書かない）', () => {
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
    expect(example).toMatch(/^DEMO_LIST_URL=\s*$/m);
  });

  it('.dev.vars（ローカルの秘密情報）は .gitignore で除外されている', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^\.dev\.vars$/m);
  });
});
