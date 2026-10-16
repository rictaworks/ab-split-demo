import { HASH_SETTINGS } from '../config/domain';

const ENCODER = new TextEncoder();

/**
 * FNV-1a 32bit の非暗号ハッシュ。入力は UTF-8 バイト列として扱う。
 * 割当の分散にのみ使い、セキュリティ用途には使わない。
 */
export function fnv1a32(text: string): number {
  let hash = HASH_SETTINGS.FNV_OFFSET_BASIS >>> 0;
  for (const byte of ENCODER.encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, HASH_SETTINGS.FNV_PRIME) >>> 0;
  }
  return hash;
}
