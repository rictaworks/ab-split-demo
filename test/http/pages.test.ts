import { createTestApp, TestApp, TEST_DEMO_LIST_URL, TEST_GA4_ID } from '../support/app';
import { createExperiment, newSession, OwnerSession } from '../support/fixtures';
import { SITE, UI_TEXT } from '../../src/config/ui';

/** 全画面の必須 4 要素（要件 8・CLAUDE.md 全デモ共通要件）と GA4 の有無を機械的に検査する。 */
function expectRequiredElements(html: string): void {
  expect(html).toContain(`class="${UI_TEXT.banner.className}"`);
  expect(html).toContain(UI_TEXT.banner.message);
  expect(html).toContain(`href="${TEST_DEMO_LIST_URL}">${UI_TEXT.backLink.label}`);
  expect(html).toContain(`<a class="site-name" href="/">${SITE.SERVICE_NAME}</a>`);
  expect(html).toContain(`href="${UI_TEXT.consult.href}"`);
  expect(html).toContain(UI_TEXT.consult.label);
  expect(html).toContain('href="/legal"');
  expect(html).toContain('href="/lp"');
  expect(html).toContain('href="/manual"');
  expect(html).toContain(`https://www.googletagmanager.com/gtag/js?id=${TEST_GA4_ID}`);
  expect(html).toContain(`gtag('config', '${TEST_GA4_ID}')`);
}

function expectNoForbiddenUi(html: string): void {
  expect(html).not.toMatch(/\balert\s*\(|\bconfirm\s*\(|\bprompt\s*\(/);
  expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  expect(html).toContain('font-awesome');
}

describe('画面（要件 8）', () => {
  let app: TestApp;
  let owner: OwnerSession;

  beforeEach(async () => {
    app = createTestApp();
    owner = await newSession(app);
  });

  it('/ は実験一覧を返し、必須 4 要素と GA4 を含む', async () => {
    const response = await app.send({ path: '/', cookie: owner.cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expectRequiredElements(html);
    expectNoForbiddenUi(html);
    expect(html).toContain('<html lang="ja">');
  });

  it('/experiments/:id は所有者に編集・結果・スニペットを表示し、必須要素を含む', async () => {
    const created = await createExperiment(app, owner);
    const response = await app.send({ path: `/experiments/${created.id}`, cookie: owner.cookie });
    expect(response.status).toBe(200);
    const html = await response.text();
    expectRequiredElements(html);
    expectNoForbiddenUi(html);
    expect(html).toContain(created.publicKey);
    expect(html).toContain('/snippet.js');
  });

  it('/experiments/:id は他人には 404 を返し、必須要素を含むエラー画面にする', async () => {
    const created = await createExperiment(app, owner);
    const intruder = await newSession(app);
    const response = await app.send({ path: `/experiments/${created.id}`, cookie: intruder.cookie });
    expect(response.status).toBe(404);
    const html = await response.text();
    expectRequiredElements(html);
    expect(html).not.toContain(created.publicKey);
  });

  it('/legal は法的表記を返し、必須要素を含む', async () => {
    const response = await app.send({ path: '/legal' });
    expect(response.status).toBe(200);
    const html = await response.text();
    expectRequiredElements(html);
    expect(html).toContain(UI_TEXT.legal.heading);
  });

  it('/lp は概要を返し、必須要素を含む', async () => {
    const response = await app.send({ path: '/lp' });
    expect(response.status).toBe(200);
    const html = await response.text();
    expectRequiredElements(html);
    expectNoForbiddenUi(html);
    expect(html).toContain(UI_TEXT.lp.heading);
    expect(html).toContain('href="/manual"');
  });

  it('/manual は操作手順を番号付きで返し、必須要素を含む', async () => {
    const response = await app.send({ path: '/manual' });
    expect(response.status).toBe(200);
    const html = await response.text();
    expectRequiredElements(html);
    expectNoForbiddenUi(html);
    expect(html).toContain(UI_TEXT.manual.heading);
    expect(html).toContain('<ol class="steps">');
    expect(html.match(/<li class="step">/g)?.length).toBe(UI_TEXT.manual.steps.length);
  });

  it('存在しないパスは 404 の画面を返す', async () => {
    const response = await app.send({ path: '/no-such-page' });
    expect(response.status).toBe(404);
    expectRequiredElements(await response.text());
  });

  it('GA4 の測定 ID が未設定なら、画面は明示的に 500 で失敗する（既定値で代用しない）', async () => {
    const unconfigured = createTestApp({ ga4MeasurementId: null });
    const response = await unconfigured.send({ path: '/legal' });
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('configuration_error');
  });

  it('/snippet.js は JavaScript を返し、Cookie を使わず、ダイアログを使わない', async () => {
    const response = await app.send({ path: '/snippet.js' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    const script = await response.text();
    expect(script).not.toMatch(/\balert\s*\(|\bconfirm\s*\(|\bprompt\s*\(/);
    expect(script).toContain('/assign');
    expect(script).toContain('/convert');
    expect(script).not.toContain('document.cookie');
  });
});

describe('Content-Security-Policy（画面の HTML）', () => {
  let app: TestApp;
  let owner: OwnerSession;

  beforeEach(async () => {
    app = createTestApp();
    owner = await newSession(app);
  });

  async function htmlPages(): Promise<Array<{ path: string; response: Response }>> {
    const created = await createExperiment(app, owner);
    const paths = ['/', `/experiments/${created.id}`, '/legal', '/no-such-page'];
    const pages: Array<{ path: string; response: Response }> = [];
    for (const path of paths) {
      pages.push({ path, response: await app.send({ path, cookie: owner.cookie }) });
    }
    return pages;
  }

  function directive(csp: string, name: string): string[] {
    const found = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
    return found === undefined ? [] : found.split(/\s+/).slice(1);
  }

  it('全 HTML 画面に CSP ヘッダがあり、危険な指定を含まない', async () => {
    for (const { path, response } of await htmlPages()) {
      const csp = response.headers.get('content-security-policy');
      expect(csp).not.toBeNull();
      expect(directive(csp!, 'default-src')).toEqual(["'self'"]);
      expect(directive(csp!, 'object-src')).toEqual(["'none'"]);
      expect(directive(csp!, 'base-uri')).toEqual(["'none'"]);
      expect(directive(csp!, 'frame-ancestors')).toEqual(["'none'"]);
      expect(directive(csp!, 'script-src')).not.toContain("'unsafe-inline'");
      expect(directive(csp!, 'script-src')).not.toContain("'unsafe-eval'");
      expect(directive(csp!, 'script-src')).not.toContain('*');
      expect(path).toBeDefined();
    }
  });

  it('GA4 と FontAwesome の配信元を許可している', async () => {
    const response = await app.send({ path: '/legal' });
    const csp = response.headers.get('content-security-policy')!;
    expect(directive(csp, 'script-src')).toEqual(
      expect.arrayContaining(['https://www.googletagmanager.com']),
    );
    expect(directive(csp, 'connect-src')).toEqual(
      expect.arrayContaining(["'self'", 'https://www.google-analytics.com']),
    );
    expect(directive(csp, 'style-src')).toEqual(expect.arrayContaining(['https://cdnjs.cloudflare.com']));
    expect(directive(csp, 'font-src')).toEqual(expect.arrayContaining(['https://cdnjs.cloudflare.com']));
  });

  it('インラインの script / style はすべてヘッダの nonce を持つ（既存の画面が壊れない）', async () => {
    for (const { path, response } of await htmlPages()) {
      const csp = response.headers.get('content-security-policy')!;
      const nonceMatch = /'nonce-([A-Za-z0-9+/=_-]+)'/.exec(directive(csp, 'script-src').join(' '));
      expect(nonceMatch).not.toBeNull();
      const nonce = nonceMatch![1]!;
      expect(directive(csp, 'style-src').join(' ')).toContain(`'nonce-${nonce}'`);
      const html = await response.text();
      const inlineScripts = html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) ?? [];
      expect(inlineScripts.length).toBeGreaterThan(0);
      for (const tag of inlineScripts) {
        expect(tag).toContain(`nonce="${nonce}"`);
      }
      const styleTags = html.match(/<style[^>]*>/g) ?? [];
      expect(styleTags.length).toBeGreaterThan(0);
      for (const tag of styleTags) {
        expect(tag).toContain(`nonce="${nonce}"`);
      }
      // インラインのイベントハンドラ・style 属性・javascript: URL は CSP で動かないため、使っていないことを確認する。
      expect(html).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
      expect(html).not.toMatch(/\sstyle\s*=\s*["']/i);
      expect(html).not.toMatch(/javascript:/i);
      expect(path).toBeDefined();
    }
  });

  it('外部の script / stylesheet の配信元はすべて CSP で許可されている', async () => {
    for (const { response } of await htmlPages()) {
      const csp = response.headers.get('content-security-policy')!;
      const html = await response.text();
      const scriptOrigins = [...html.matchAll(/<script[^>]*\ssrc="(https:\/\/[^"/]+)/g)].map((m) => m[1]!);
      const styleOrigins = [...html.matchAll(/<link[^>]*\shref="(https:\/\/[^"/]+)/g)].map((m) => m[1]!);
      expect(scriptOrigins.length).toBeGreaterThan(0);
      expect(styleOrigins.length).toBeGreaterThan(0);
      for (const origin of scriptOrigins) {
        expect(directive(csp, 'script-src')).toContain(origin);
      }
      for (const origin of styleOrigins) {
        expect(directive(csp, 'style-src')).toContain(origin);
      }
    }
  });

  it('nonce は応答ごとに変わる', async () => {
    const first = (await app.send({ path: '/legal' })).headers.get('content-security-policy');
    const second = (await app.send({ path: '/legal' })).headers.get('content-security-policy');
    expect(first).not.toBe(second);
  });

  it('JSON の応答には CSP を付けない（HTML 画面のみ）', async () => {
    const response = await app.send({ path: '/api/experiments', cookie: owner.cookie });
    expect(response.headers.get('content-security-policy')).toBeNull();
  });
});
