import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { EXPERIMENT_STATUS, ASSIGN_SOURCE, CONVERT_REASON, JUDGEMENT } from '../../src/config/domain';

const CORE_DIR = join(__dirname, '..', '..', 'src', 'core');

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return listSourceFiles(path);
    }
    return name.endsWith('.ts') ? [path] : [];
  });
}

/** コメントを除いたコードだけを検査対象にする（説明コメントの日本語は許容する）。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const CORE_FILES = listSourceFiles(CORE_DIR).map((path) => ({
  path,
  source: stripComments(readFileSync(path, 'utf8')),
}));

/** 日本語（ひらがな・カタカナ・漢字・全角記号）を検出する。 */
const JAPANESE_PATTERN = /[぀-ヿ㐀-鿿＀-￯]/;
const NATIVE_DIALOG_PATTERN = /\b(alert|confirm|prompt)\s*\(/;

describe('src/core のハードコード検査', () => {
  it('src/core にファイルが存在する（検査対象が空でないこと）', () => {
    expect(CORE_FILES.length).toBeGreaterThan(0);
  });

  it.each(CORE_FILES.map((f) => [f.path, f.source]))(
    '%s に日本語の画面文言が直書きされていない',
    (_path, source) => {
      expect(JAPANESE_PATTERN.test(source as string)).toBe(false);
    },
  );

  it.each(CORE_FILES.map((f) => [f.path, f.source]))(
    '%s にネイティブの alert / confirm / prompt が無い',
    (_path, source) => {
      expect(NATIVE_DIALOG_PATTERN.test(source as string)).toBe(false);
    },
  );

  it('ステータス名・判定コード等の文字列が src/core に直書きされていない', () => {
    const literals = [
      ...Object.values(EXPERIMENT_STATUS),
      ...Object.values(ASSIGN_SOURCE),
      ...Object.values(CONVERT_REASON),
      ...Object.values(JUDGEMENT),
    ];
    for (const file of CORE_FILES) {
      for (const literal of literals) {
        const quoted = [`'${literal}'`, `"${literal}"`, `\`${literal}\``];
        for (const token of quoted) {
          expect({ file: file.path, found: file.source.includes(token) }).toEqual({
            file: file.path,
            found: false,
          });
        }
      }
    }
  });
});
