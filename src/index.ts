import type { AppDeps, WorkerEnv } from './app/deps';
import { DAILY_RESET } from './config/http';
import { SERVICE_MESSAGE } from './config/messages';
import { ConfigurationError } from './app/errors';
import { handleRequest } from './http/router';
import { runDailyReset } from './services/daily-reset';
import { trace, traceError } from './infra/trace';

export interface ScheduledEventLike {
  readonly cron: string;
  readonly scheduledTime: number;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

/** Workers の環境変数から、1 リクエストで使う依存を組み立てる。 */
export function buildDeps(env: WorkerEnv): AppDeps {
  return {
    db: env.DB,
    ga4MeasurementId: env.GA4_MEASUREMENT_ID ?? null,
    demoListUrl: env.DEMO_LIST_URL ?? null,
    now: () => new Date(),
    randomBytes: (length: number) => {
      const bytes = new Uint8Array(length);
      globalThis.crypto.getRandomValues(bytes);
      return bytes;
    },
  };
}

/** Cron Triggers（UTC 18:00 = JST 03:00）の処理。想定外の式では何もせず、明示的に失敗する。 */
export async function scheduled(
  event: ScheduledEventLike,
  env: WorkerEnv,
  _ctx: ExecutionContextLike,
): Promise<void> {
  if (event.cron !== DAILY_RESET.CRON) {
    trace('cron.unexpected', { cron: event.cron });
    throw new ConfigurationError(SERVICE_MESSAGE.UNEXPECTED_CRON(event.cron));
  }
  try {
    await runDailyReset(env.DB);
  } catch (error) {
    // 失敗を握りつぶさず、ログに残して Workers の実行結果（失敗）として伝える。
    traceError('cron.reset_failed', error, {});
    throw error;
  }
}

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleRequest(request, buildDeps(env));
  },
  scheduled,
};
