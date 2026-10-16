import * as vm from 'vm';
import { CLIENT_SCRIPT } from '../../src/views/client';

type Listener = (event: unknown) => void;

export interface FakeElement {
  textContent: string;
  className: string;
  getAttribute(name: string): string | null;
  [key: string]: unknown;
}

export interface FetchReply {
  readonly ok: boolean;
  readonly json: unknown;
}

export interface ClientHarness {
  readonly feedback: FakeElement;
  readonly storage: Map<string, string>;
  readonly reload: jest.Mock;
  readonly assign: jest.Mock;
  readonly fetchMock: jest.Mock;
  readonly errors: unknown[][];
  readonly variantRows: string[];
  dispatch(type: string, event: unknown): void;
  element(attributes: Record<string, string>, extra?: Record<string, unknown>): FakeElement;
  flush(): Promise<void>;
}

export interface HarnessOptions {
  readonly messages: Record<string, string>;
  readonly replies?: FetchReply[];
  readonly storage?: Map<string, string>;
  /** true なら sessionStorage の読み書きが例外になる。 */
  readonly storageBroken?: boolean;
  readonly initialRows?: number;
  readonly limits?: { min: number; max: number };
}

/** 画面のクライアント処理（CLIENT_SCRIPT）を、最小限の疑似 DOM の上で実行する。 */
export function runClient(options: HarnessOptions): ClientHarness {
  const listeners: Record<string, Listener[]> = {};
  const storage = options.storage ?? new Map<string, string>();
  const errors: unknown[][] = [];
  const reload = jest.fn();
  const assign = jest.fn();
  const replies = [...(options.replies ?? [])];
  const fetchMock = jest.fn(() => {
    const reply = replies.shift();
    if (reply === undefined) {
      return Promise.reject(new Error('unexpected fetch'));
    }
    return Promise.resolve({ ok: reply.ok, json: () => Promise.resolve(reply.json) });
  });
  const element = (attributes: Record<string, string>, extra: Record<string, unknown> = {}): FakeElement => ({
    textContent: '',
    className: '',
    getAttribute: (name: string) => attributes[name] ?? null,
    ...extra,
  });
  const feedback = element({});
  const variantRows: string[] = Array.from({ length: options.initialRows ?? 2 }, (_unused, index) => `row-${index}`);
  const list = element(
    {
      'data-min-variants': String(options.limits?.min ?? 2),
      'data-max-variants': String(options.limits?.max ?? 4),
      'data-next-index': String(variantRows.length),
    },
    {
      querySelectorAll: () => variantRows.map((row) => ({ row })),
      insertAdjacentHTML: (_position: string, html: string) => {
        variantRows.push(html);
      },
      setAttribute: () => undefined,
    },
  );
  const template = element({}, { innerHTML: '<div data-variant-row>v__INDEX__.key</div>' });
  const document = {
    addEventListener: (type: string, fn: Listener) => {
      (listeners[type] ??= []).push(fn);
    },
    getElementById: (id: string) => (id === 'feedback' ? feedback : null),
    querySelector: (selector: string) => {
      if (selector === '[data-variant-list]') { return list; }
      if (selector === '[data-variant-template]') { return template; }
      return null;
    },
    body: { getAttribute: (name: string) => (name === 'data-messages' ? JSON.stringify(options.messages) : null) },
  };
  const sessionStorage = {
    getItem: (key: string) => {
      if (options.storageBroken === true) { throw new Error('storage blocked'); }
      return storage.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (options.storageBroken === true) { throw new Error('storage blocked'); }
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      if (options.storageBroken === true) { throw new Error('storage blocked'); }
      storage.delete(key);
    },
  };
  const context = {
    document,
    window: { location: { assign, reload }, sessionStorage },
    fetch: fetchMock,
    navigator: {},
    console: { error: (...args: unknown[]) => errors.push(args), log: () => undefined },
    JSON,
    Number,
    Object,
    Array,
    String,
    RegExp,
  };
  vm.runInNewContext(CLIENT_SCRIPT, context);
  return {
    feedback,
    storage,
    reload,
    assign,
    fetchMock,
    errors,
    variantRows,
    dispatch: (type, event) => (listeners[type] ?? []).forEach((fn) => fn(event)),
    element,
    flush: () => new Promise((resolve) => setImmediate(resolve)),
  };
}

export function simulationForm(harness: ClientHarness): FakeElement {
  return harness.element(
    { 'data-api': 'POST /api/experiments/e1/simulate', 'data-collect': 'simulation' },
    { elements: [{ name: 'visitorCount', value: '100' }, { name: 'rate-a', value: '0.1' }] },
  );
}
