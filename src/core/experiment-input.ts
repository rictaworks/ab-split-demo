import {
  EXPERIMENT_STATUS,
  ExperimentStatus,
  INPUT_RULES,
} from '../config/domain';
import { FIELD_NAME, INPUT_MESSAGE } from '../config/messages';
import { ValidationError } from './errors';

export interface VariantPayload {
  readonly selector?: string;
  readonly text?: string;
  readonly color?: string;
}

export interface VariantInput {
  readonly key: string;
  readonly label: string;
  readonly weight: number;
  readonly payload: VariantPayload;
}

export interface ExperimentInput {
  readonly name: string;
  readonly goalName: string;
  readonly minSample: number;
  readonly variants: readonly VariantInput[];
}

export interface SimulateRequest {
  readonly visitorCount: number;
  readonly conversionRates: Readonly<Record<string, number>>;
}

const EXPERIMENT_KEYS: readonly string[] = ['name', 'goalName', 'minSample', 'variants', 'website'];
const VARIANT_KEYS: readonly string[] = ['key', 'label', 'weight', 'payload'];
const PAYLOAD_KEYS: readonly string[] = ['selector', 'text', 'color'];
const SIMULATE_KEYS: readonly string[] = ['visitorCount', 'conversionRates'];
const HONEYPOT_KEY = 'website';
const CONVERT_KEYS: readonly string[] = ['visitorId', 'goalName'];
const STATUS_CHANGE_KEYS: readonly string[] = ['to'];

/**
 * 実験の作成・編集の本文を検証する。不正な値は既定値に置き換えず、ValidationError で拒否する。
 * ハニーポット項目（website）は値があれば拒否し、結果には含めない。
 */
export function parseExperimentInput(raw: unknown): ExperimentInput {
  const body = requireObject(raw);
  rejectUnknownKeys(body, EXPERIMENT_KEYS);
  assertNoHoneypot(body);

  const name = requireTrimmedString(body, 'name', FIELD_NAME.NAME, INPUT_RULES.NAME_MAX_LENGTH);
  const goalName = requireIdentifier(body, 'goalName', FIELD_NAME.GOAL_NAME_LABEL, INPUT_RULES.GOAL_NAME_MAX_LENGTH);
  const minSample = requireInteger(body, 'minSample', FIELD_NAME.MIN_SAMPLE, 1, INPUT_RULES.MIN_SAMPLE_MAX);
  const variants = parseVariants(body['variants']);

  return { name, goalName, minSample, variants };
}

/** 作成本文のハニーポット項目を検査する。値があれば拒否する。 */
export function assertNoHoneypot(raw: Record<string, unknown>): void {
  const value = raw[HONEYPOT_KEY];
  if (value !== undefined && value !== '') {
    throw new ValidationError(INPUT_MESSAGE.HONEYPOT_FILLED);
  }
}

export function parsePublicKey(raw: unknown): string {
  if (typeof raw !== 'string' || !INPUT_RULES.PUBLIC_KEY_PATTERN.test(raw)) {
    throw new ValidationError(
      INPUT_MESSAGE.INVALID_STRING(FIELD_NAME.PUBLIC_KEY, INPUT_MESSAGE.RULE.PUBLIC_KEY(INPUT_RULES.PUBLIC_KEY_LENGTH), raw),
    );
  }
  return raw;
}

export function parseVisitorId(raw: unknown): string {
  if (
    typeof raw !== 'string' ||
    raw.length === 0 ||
    raw.length > INPUT_RULES.VISITOR_ID_MAX_LENGTH ||
    !INPUT_RULES.IDENTIFIER_PATTERN.test(raw)
  ) {
    throw new ValidationError(
      INPUT_MESSAGE.INVALID_STRING(
        FIELD_NAME.VISITOR_ID,
        INPUT_MESSAGE.RULE.IDENTIFIER(INPUT_RULES.VISITOR_ID_MAX_LENGTH),
        raw,
      ),
    );
  }
  return raw;
}

export function parseGoalName(raw: unknown): string {
  if (
    typeof raw !== 'string' ||
    raw.length === 0 ||
    raw.length > INPUT_RULES.GOAL_NAME_MAX_LENGTH ||
    !INPUT_RULES.IDENTIFIER_PATTERN.test(raw)
  ) {
    throw new ValidationError(
      INPUT_MESSAGE.INVALID_STRING(
        FIELD_NAME.GOAL_NAME,
        INPUT_MESSAGE.RULE.IDENTIFIER(INPUT_RULES.GOAL_NAME_MAX_LENGTH),
        raw,
      ),
    );
  }
  return raw;
}

/** 状態変更の指定先。管理操作で指定できるのは running と paused のみ（capped は自動遷移）。 */
export function parseTargetStatus(raw: unknown): ExperimentStatus {
  if (raw === EXPERIMENT_STATUS.RUNNING || raw === EXPERIMENT_STATUS.PAUSED) {
    return raw;
  }
  throw new ValidationError(INPUT_MESSAGE.INVALID_TARGET_STATUS(raw));
}

export function parseSimulateInput(raw: unknown): SimulateRequest {
  const body = requireObject(raw);
  rejectUnknownKeys(body, SIMULATE_KEYS);
  const visitorCount = requireInteger(
    body,
    'visitorCount',
    FIELD_NAME.VISITOR_COUNT,
    1,
    INPUT_RULES.SIMULATE_VISITORS_MAX,
  );
  const rates = body['conversionRates'];
  if (typeof rates !== 'object' || rates === null || Array.isArray(rates)) {
    throw new ValidationError(INPUT_MESSAGE.REQUIRED_FIELD('conversionRates'));
  }
  const conversionRates: Record<string, number> = {};
  for (const [variantId, rate] of Object.entries(rates)) {
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 1) {
      throw new ValidationError(INPUT_MESSAGE.INVALID_NUMBER(INPUT_MESSAGE.CONVERSION_RATE_LABEL(variantId), INPUT_MESSAGE.RULE.RATE_RANGE, rate));
    }
    conversionRates[variantId] = rate;
  }
  return { visitorCount, conversionRates };
}

function parseVariants(raw: unknown): VariantInput[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError(INPUT_MESSAGE.REQUIRED_FIELD(FIELD_NAME.VARIANTS));
  }
  if (raw.length < INPUT_RULES.VARIANT_MIN_COUNT || raw.length > INPUT_RULES.VARIANT_MAX_COUNT) {
    throw new ValidationError(
      INPUT_MESSAGE.INVALID_VARIANT_COUNT(INPUT_RULES.VARIANT_MIN_COUNT, INPUT_RULES.VARIANT_MAX_COUNT, raw.length),
    );
  }
  const keys = new Set<string>();
  return raw.map((item, index) => {
    const variant = requireObject(item, INPUT_MESSAGE.VARIANT_ITEM_LABEL(index));
    rejectUnknownKeys(variant, VARIANT_KEYS);
    const key = requireIdentifier(variant, 'key', FIELD_NAME.VARIANT_KEY, INPUT_RULES.VARIANT_KEY_MAX_LENGTH);
    if (keys.has(key)) {
      throw new ValidationError(INPUT_MESSAGE.DUPLICATE_VARIANT_KEY(key));
    }
    keys.add(key);
    const label = requireTrimmedString(variant, 'label', FIELD_NAME.VARIANT_LABEL, INPUT_RULES.VARIANT_LABEL_MAX_LENGTH);
    const weight = requireInteger(variant, 'weight', FIELD_NAME.WEIGHT, INPUT_RULES.WEIGHT_MIN, INPUT_RULES.WEIGHT_MAX);
    const payload = parsePayload(key, variant['payload']);
    return { key, label, weight, payload };
  });
}

function parsePayload(key: string, raw: unknown): VariantPayload {
  if (raw === undefined) {
    return {};
  }
  const payload = requireObject(raw, INPUT_MESSAGE.PAYLOAD_LABEL(key));
  rejectUnknownKeys(payload, PAYLOAD_KEYS, (field) => INPUT_MESSAGE.INVALID_PAYLOAD(key, INPUT_MESSAGE.UNKNOWN_FIELD(field)));
  const result: { selector?: string; text?: string; color?: string } = {};
  if (payload['selector'] !== undefined) {
    result.selector = requireStringValue(payload['selector'], FIELD_NAME.SELECTOR, INPUT_RULES.SELECTOR_MAX_LENGTH, 1, key);
  }
  if (payload['text'] !== undefined) {
    result.text = requireStringValue(payload['text'], FIELD_NAME.TEXT, INPUT_RULES.TEXT_MAX_LENGTH, 1, key);
  }
  if (payload['color'] !== undefined) {
    if (typeof payload['color'] !== 'string' || !INPUT_RULES.COLOR_PATTERN.test(payload['color'])) {
      throw new ValidationError(INPUT_MESSAGE.INVALID_PAYLOAD_COLOR(key, payload['color']));
    }
    result.color = payload['color'];
  }
  return result;
}

function requireObject(raw: unknown, label?: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ValidationError(label === undefined ? INPUT_MESSAGE.NOT_OBJECT : INPUT_MESSAGE.INVALID_STRING(label, INPUT_MESSAGE.RULE.OBJECT, raw));
  }
  return raw as Record<string, unknown>;
}

function rejectUnknownKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
  message: (field: string) => string = INPUT_MESSAGE.UNKNOWN_FIELD,
): void {
  for (const field of Object.keys(body)) {
    if (!allowed.includes(field)) {
      throw new ValidationError(message(field));
    }
  }
}

function requireTrimmedString(body: Record<string, unknown>, field: string, label: string, maxLength: number): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new ValidationError(INPUT_MESSAGE.INVALID_STRING(label, INPUT_MESSAGE.RULE.TRIMMED_TEXT(maxLength), value));
  }
  return value.trim();
}

function requireIdentifier(body: Record<string, unknown>, field: string, label: string, maxLength: number): string {
  const value = body[field];
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || !INPUT_RULES.IDENTIFIER_PATTERN.test(value)) {
    throw new ValidationError(
      INPUT_MESSAGE.INVALID_STRING(label, INPUT_MESSAGE.RULE.IDENTIFIER(maxLength), value),
    );
  }
  return value;
}

function requireStringValue(value: unknown, label: string, maxLength: number, minLength: number, key: string): string {
  if (typeof value !== 'string' || value.length < minLength || value.length > maxLength) {
    throw new ValidationError(
      INPUT_MESSAGE.INVALID_PAYLOAD_TEXT(key, label, minLength, maxLength, value),
    );
  }
  return value;
}

function requireInteger(body: Record<string, unknown>, field: string, label: string, min: number, max: number): number {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(INPUT_MESSAGE.INVALID_INTEGER(label, INPUT_MESSAGE.RULE.RANGE(min, max), value));
  }
  return value;
}

/** 転換記録の本文（visitorId と goalName）を検証する。 */
export function parseConvertInput(raw: unknown): { visitorId: string; goalName: string } {
  const body = requireObject(raw);
  rejectUnknownKeys(body, CONVERT_KEYS);
  return {
    visitorId: parseVisitorId(body['visitorId']),
    goalName: parseGoalName(body['goalName']),
  };
}

/** 状態変更の本文（to）を検証する。 */
export function parseStatusChangeInput(raw: unknown): ExperimentStatus {
  const body = requireObject(raw);
  rejectUnknownKeys(body, STATUS_CHANGE_KEYS);
  return parseTargetStatus(body['to']);
}
