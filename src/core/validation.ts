import { ERROR_MESSAGE } from '../config/messages';
import { DomainCoreError } from './errors';

export function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DomainCoreError(ERROR_MESSAGE.EMPTY_STRING(name, value));
  }
  return value;
}

export function requireCount(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new DomainCoreError(ERROR_MESSAGE.INVALID_COUNT_VALUE(name, value));
  }
  return value;
}
