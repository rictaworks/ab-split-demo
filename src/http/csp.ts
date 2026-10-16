import { CSP } from '../config/http';
import { SERVICE_MESSAGE } from '../config/messages';
import { ConfigurationError } from '../app/errors';

/** 応答ごとの nonce を作る（base64）。乱数は呼び出し側から受け取る。 */
export function newCspNonce(randomBytes: (length: number) => Uint8Array): string {
  return btoa(String.fromCharCode(...randomBytes(CSP.NONCE_BYTES)));
}

function directive(name: string, sources: readonly string[]): string {
  return `${name} ${sources.join(' ')}`;
}

/** 画面の HTML に付ける Content-Security-Policy を組み立てる。nonce が不正なら明示的に失敗する。 */
export function buildContentSecurityPolicy(nonce: string): string {
  if (nonce.length === 0 || !CSP.NONCE_PATTERN.test(nonce)) {
    throw new ConfigurationError(SERVICE_MESSAGE.INVALID_CSP_NONCE);
  }
  const nonceSource = `'nonce-${nonce}'`;
  const d = CSP.DIRECTIVES;
  return [
    directive('default-src', d.DEFAULT_SRC),
    directive('script-src', [d.SCRIPT_SRC[0], nonceSource, ...d.SCRIPT_SRC.slice(1)]),
    directive('style-src', [d.STYLE_SRC[0], nonceSource, ...d.STYLE_SRC.slice(1)]),
    directive('font-src', d.FONT_SRC),
    directive('img-src', d.IMG_SRC),
    directive('connect-src', d.CONNECT_SRC),
    directive('object-src', d.OBJECT_SRC),
    directive('base-uri', d.BASE_URI),
    directive('form-action', d.FORM_ACTION),
    directive('frame-ancestors', d.FRAME_ANCESTORS),
  ].join('; ');
}
