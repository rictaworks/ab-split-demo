import { COOKIE, SNIPPET } from '../config/http';

/** 乱数バイト列を小文字 16 進数にする。 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 公開キー（32 文字の推測不能な乱数）を発行する。 */
export function newPublicKey(randomBytes: (length: number) => Uint8Array): string {
  return toHex(randomBytes(16));
}

/** 内部 ID（実験・バリアント・割当・転換）を発行する。 */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function newSessionId(randomBytes: (length: number) => Uint8Array): string {
  return toHex(randomBytes(COOKIE.SESSION_ID_BYTES));
}

export function newVisitorId(randomBytes: (length: number) => Uint8Array): string {
  return toHex(randomBytes(SNIPPET.VISITOR_ID_BYTES));
}

/** 0 以上 1 未満の一様乱数（模擬トラフィック用）。 */
export function randomUnit(randomBytes: (length: number) => Uint8Array): number {
  const bytes = randomBytes(4);
  const value = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  return value / 0x100000000;
}
