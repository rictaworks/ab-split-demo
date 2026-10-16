import { fingerprintSecret } from '../../src/core/fingerprint';

describe('fingerprintSecret（ログ用の識別子）', () => {
  it('SHA-256 の先頭 8 文字（16 進）を返す', async () => {
    // SHA-256("abc") = ba7816bf 8f01cfea ...
    expect(await fingerprintSecret('abc')).toBe('ba7816bf');
  });

  it('同じ入力には同じ値、異なる入力には異なる値を返す', async () => {
    const a = await fingerprintSecret('a'.repeat(32));
    const b = await fingerprintSecret('b'.repeat(32));
    expect(a).toBe(await fingerprintSecret('a'.repeat(32)));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it('元の値を含まない', async () => {
    const secret = '0123456789abcdef0123456789abcdef';
    expect(await fingerprintSecret(secret)).not.toContain(secret.slice(0, 8));
  });

  it('空文字列は明示的に拒否する', async () => {
    await expect(fingerprintSecret('')).rejects.toThrow();
  });
});
