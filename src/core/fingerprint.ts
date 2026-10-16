import { SERVICE_MESSAGE } from '../config/messages';
import { DomainCoreError } from './errors';

const FINGERPRINT_HEX_LENGTH = 8;
const ENCODER = new TextEncoder();

/**
 * ログ用の識別子。入力の SHA-256 の先頭 8 文字（16 進）を返す。
 * セッション ID などトークン相当の値を平文でログに出さず、同一セッションの追跡だけを可能にする。
 */
export async function fingerprintSecret(secret: string): Promise<string> {
  if (secret.length === 0) {
    throw new DomainCoreError(SERVICE_MESSAGE.EMPTY_FINGERPRINT_INPUT);
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', ENCODER.encode(secret));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, FINGERPRINT_HEX_LENGTH);
}
