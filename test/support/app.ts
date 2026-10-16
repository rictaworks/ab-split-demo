import { DatabaseSync } from 'node:sqlite';
import { AppDeps } from '../../src/app/deps';
import { handleRequest } from '../../src/http/router';
import { adaptSqlite, openMigratedDatabase } from './sqlite-d1';

/** 実行ログ（構造化ログ）はテスト出力を汚すため抑止する。 */
jest.spyOn(console, 'log').mockImplementation(() => undefined);
jest.spyOn(console, 'error').mockImplementation(() => undefined);

export const TEST_GA4_ID = 'G-TEST12345';
export const TEST_DEMO_LIST_URL = 'https://demo-list.example.test/';
export const TEST_NOW = new Date('2026-10-17T00:00:00.000Z');

export interface TestApp {
  readonly raw: DatabaseSync;
  readonly deps: AppDeps;
  send(options: SendOptions): Promise<Response>;
}

export interface SendOptions {
  readonly method?: string;
  readonly path: string;
  readonly cookie?: string;
  readonly json?: unknown;
  readonly rawBody?: string;
  readonly contentType?: string;
  readonly headers?: Record<string, string>;
}

export function createTestApp(overrides: Partial<AppDeps> = {}): TestApp {
  const raw = openMigratedDatabase();
  const deps: AppDeps = {
    db: adaptSqlite(raw),
    ga4MeasurementId: TEST_GA4_ID,
    demoListUrl: TEST_DEMO_LIST_URL,
    now: () => new Date(TEST_NOW),
    randomBytes: (length: number) => {
      const bytes = new Uint8Array(length);
      globalThis.crypto.getRandomValues(bytes);
      return bytes;
    },
    ...overrides,
  };
  return {
    raw,
    deps,
    send: async (options: SendOptions): Promise<Response> => {
      const headers: Record<string, string> = { ...(options.headers ?? {}) };
      if (options.cookie !== undefined) {
        headers['cookie'] = options.cookie;
      }
      let body: string | undefined;
      if (options.json !== undefined) {
        body = JSON.stringify(options.json);
        headers['content-type'] = options.contentType ?? 'application/json';
      } else if (options.rawBody !== undefined) {
        body = options.rawBody;
        headers['content-type'] = options.contentType ?? 'application/json';
      }
      const request = new Request(`https://demo.example.test${options.path}`, {
        method: options.method ?? 'GET',
        headers,
        body,
      });
      return handleRequest(request, deps);
    },
  };
}

/** Set-Cookie から セッション Cookie の値（name=value）を取り出す。 */
export function sessionCookieOf(response: Response): string {
  const header = response.headers.get('set-cookie') ?? '';
  const match = /ab_session=([0-9a-f]{32})/.exec(header);
  if (match === null) {
    throw new Error(`セッション Cookie が応答にありません（Set-Cookie: ${header}）。`);
  }
  return `ab_session=${match[1]}`;
}
