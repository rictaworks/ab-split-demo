import { COOKIE, HEADER } from '../config/http';
import type { AppDeps } from '../app/deps';
import { newSessionId } from '../infra/ids';

export interface Session {
  readonly sessionId: string;
  /** 新規発行したときだけ Set-Cookie の値を持つ。 */
  readonly setCookie: string | null;
}

const SESSION_ID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * Cookie のセッション ID を読む。無い、または形式が不正なら新しく発行する。
 * 計測 API（/t/*）はこの関数を呼ばない（Cookie を使わない）。
 */
export function resolveSession(request: Request, deps: AppDeps): Session {
  const existing = readSessionCookie(request.headers.get(HEADER.COOKIE));
  if (existing !== null) {
    return { sessionId: existing, setCookie: null };
  }
  const sessionId = newSessionId(deps.randomBytes);
  return { sessionId, setCookie: buildSessionCookie(sessionId) };
}

export function readSessionCookie(header: string | null): string | null {
  if (header === null) {
    return null;
  }
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE.SESSION_NAME) {
      const value = rest.join('=');
      return SESSION_ID_PATTERN.test(value) ? value : null;
    }
  }
  return null;
}

export function buildSessionCookie(sessionId: string): string {
  return [
    `${COOKIE.SESSION_NAME}=${sessionId}`,
    'Path=/',
    `Max-Age=${COOKIE.SESSION_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}
