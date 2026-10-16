import * as vm from 'vm';
import { buildSnippetSource } from '../../src/snippet/snippet';
import { SNIPPET } from '../../src/config/http';

/** スニペットが動く最小限の疑似ブラウザ（vm 上）。fetch は関数のモック。 */
class FakeElement {
  textContent = 'original';
  style: { backgroundColor: string } = { backgroundColor: '' };
  constructor(private readonly matches: string[] = []) {}
  closest(selector: string): FakeElement | null {
    return this.matches.includes(selector) ? this : null;
  }
}

interface Setup {
  readonly storage?: 'working' | 'broken';
  readonly assignReply?: { ok: boolean; status?: number; json: unknown } | 'network-error';
  readonly elements?: Record<string, FakeElement>;
  readonly goalSelector?: string | null;
}

function runSnippet(setup: Setup): {
  fetchMock: jest.Mock;
  errors: unknown[][];
  click(target: unknown): void;
  storage: Map<string, string>;
  flush(): Promise<void>;
} {
  const listeners: Record<string, Array<(event: unknown) => void>> = {};
  const storage = new Map<string, string>();
  const errors: unknown[][] = [];
  const attributes: Record<string, string | null> = {
    'data-key': 'pubkey123',
    'data-goal-selector': setup.goalSelector === undefined ? '#buy' : setup.goalSelector,
  };
  const fetchMock = jest.fn((url: string) => {
    if (url.includes('/assign')) {
      const reply = setup.assignReply ?? 'network-error';
      if (reply === 'network-error') {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve({ ok: reply.ok, status: reply.status ?? 200, json: () => Promise.resolve(reply.json) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
  const localStorage =
    setup.storage === 'broken'
      ? {
          getItem: () => {
            throw new Error('SecurityError');
          },
          setItem: () => {
            throw new Error('SecurityError');
          },
        }
      : {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => void storage.set(key, value),
        };
  const document = {
    currentScript: {
      getAttribute: (name: string) => attributes[name] ?? null,
      src: 'https://demo.example.test/snippet.js',
    },
    readyState: 'complete',
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      (listeners[type] ??= []).push(fn);
    },
    querySelector: (selector: string) => setup.elements?.[selector] ?? null,
  };
  const context = {
    document,
    window: {
      localStorage,
      crypto: { getRandomValues: (bytes: Uint8Array) => bytes.fill(171) },
    },
    fetch: fetchMock,
    URL,
    Element: FakeElement,
    Uint8Array,
    Array,
    encodeURIComponent,
    JSON,
    Error,
    console: { error: (...args: unknown[]) => errors.push(args) },
  };
  vm.runInNewContext(buildSnippetSource(), context);
  return {
    fetchMock,
    errors,
    storage,
    click: (target) => (listeners['click'] ?? []).forEach((fn) => fn({ target })),
    flush: () => new Promise((resolve) => setImmediate(resolve)),
  };
}

const VARIANT_REPLY = {
  ok: true,
  json: { variant: { key: 'variant-b', payload: { selector: '#cta', text: '今すぐ', color: '#ff0000' } }, goalName: 'purchase' },
};

describe('埋め込みスニペットの実行（vm 上）', () => {
  it('割当の応答に従って、対象要素の文言と背景色を差し替え、訪問者 ID を保存する', async () => {
    const cta = new FakeElement();
    const run = runSnippet({ assignReply: VARIANT_REPLY, elements: { '#cta': cta } });
    await run.flush();
    expect(cta.textContent).toBe('今すぐ');
    expect(cta.style.backgroundColor).toBe('#ff0000');
    const savedId = run.storage.get(SNIPPET.VISITOR_STORAGE_KEY);
    expect(savedId).toMatch(new RegExp(`^(ab){${SNIPPET.VISITOR_ID_BYTES}}$`));
    const assignUrl = String(run.fetchMock.mock.calls[0]![0]);
    expect(assignUrl).toBe(`https://demo.example.test/t/pubkey123/assign?visitor_id=${savedId}`);
    expect(run.errors).toHaveLength(0);
  });

  it('保存済みの訪問者 ID を再利用する', async () => {
    const run = runSnippet({ assignReply: VARIANT_REPLY, elements: { '#cta': new FakeElement() } });
    await run.flush();
    expect(run.storage.size).toBe(1);
  });

  it('ゴール要素のクリックで convert を送り、ほかの要素のクリックでは送らない', async () => {
    const run = runSnippet({ assignReply: VARIANT_REPLY, elements: { '#cta': new FakeElement() } });
    await run.flush();
    run.click(new FakeElement(['#other']));
    expect(run.fetchMock).toHaveBeenCalledTimes(1);

    run.click(new FakeElement(['#buy']));
    expect(run.fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = run.fetchMock.mock.calls[1] as [string, { method: string; body: string }];
    expect(url).toBe('https://demo.example.test/t/pubkey123/convert');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body) as { visitorId: string; goalName: string };
    expect(body.goalName).toBe('purchase');
    expect(body.visitorId).toBe(run.storage.get(SNIPPET.VISITOR_STORAGE_KEY));
  });

  it('既定表示（variant が null）のときは要素を変えず、goalName が null ならクリックでも送らない', async () => {
    const cta = new FakeElement();
    const run = runSnippet({ assignReply: { ok: true, json: { variant: null, goalName: null } }, elements: { '#cta': cta } });
    await run.flush();
    expect(cta.textContent).toBe('original');
    run.click(new FakeElement(['#buy']));
    expect(run.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('localStorage が使えないときは例外で止まらず、既定表示のまま、通信もせず、経路をログに残す', async () => {
    const cta = new FakeElement();
    let run!: ReturnType<typeof runSnippet>;
    expect(() => {
      run = runSnippet({ storage: 'broken', assignReply: VARIANT_REPLY, elements: { '#cta': cta } });
    }).not.toThrow();
    await run.flush();
    expect(cta.textContent).toBe('original');
    expect(run.fetchMock).not.toHaveBeenCalled();
    expect(run.errors).toHaveLength(1);
    expect(String(run.errors[0]![0])).toContain('localStorage');
  });

  it('割当 API が失敗しても例外で止まらず、既定表示のまま、ログを残す', async () => {
    const cta = new FakeElement();
    const run = runSnippet({ assignReply: { ok: false, status: 500, json: {} }, elements: { '#cta': cta } });
    await run.flush();
    expect(cta.textContent).toBe('original');
    expect(String(run.errors[0]![0])).toContain('assign request failed');
  });

  it('通信エラーでも例外で止まらず、ログを残す', async () => {
    const run = runSnippet({ assignReply: 'network-error', elements: {} });
    await run.flush();
    expect(String(run.errors[0]![0])).toContain('assign request failed');
  });

  it('対象要素が見つからないときは、ログを残して続行する（ゴール計測は有効）', async () => {
    const run = runSnippet({ assignReply: VARIANT_REPLY, elements: {} });
    await run.flush();
    expect(String(run.errors[0]![0])).toContain('target element was not found');
    run.click(new FakeElement(['#buy']));
    expect(run.fetchMock).toHaveBeenCalledTimes(2);
  });
});
