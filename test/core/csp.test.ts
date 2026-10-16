import { buildContentSecurityPolicy } from '../../src/http/csp';

describe('buildContentSecurityPolicy', () => {
  it('nonce を script-src と style-src に入れ、設定の配信元を含む', () => {
    const csp = buildContentSecurityPolicy('abc123');
    expect(csp).toContain("script-src 'self' 'nonce-abc123' https://www.googletagmanager.com");
    expect(csp).toContain("style-src 'self' 'nonce-abc123' https://cdnjs.cloudflare.com");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('nonce が空、または CSP の構文を壊す文字を含むときは明示的に拒否する', () => {
    expect(() => buildContentSecurityPolicy('')).toThrow();
    expect(() => buildContentSecurityPolicy("a'; script-src *")).toThrow();
    expect(() => buildContentSecurityPolicy('a b')).toThrow();
  });
});
