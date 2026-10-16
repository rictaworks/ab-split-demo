import { fnv1a32 } from '../../src/core/hash';

describe('fnv1a32', () => {
  it('空文字列は offset basis を返す', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
  });

  it('既知のテストベクタと一致する（FNV-1a 32bit）', () => {
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('同じ入力には同じ値を返す（決定的）', () => {
    expect(fnv1a32('pubkey-visitor-1')).toBe(fnv1a32('pubkey-visitor-1'));
  });

  it('結果は 0 以上 2^32 未満の整数である', () => {
    const value = fnv1a32('境界値テスト');
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(2 ** 32);
  });
});
