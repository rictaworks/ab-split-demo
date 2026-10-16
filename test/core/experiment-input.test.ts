import {
  assertNoHoneypot,
  parseExperimentInput,
  parseGoalName,
  parsePublicKey,
  parseSimulateInput,
  parseTargetStatus,
  parseVisitorId,
} from '../../src/core/experiment-input';
import { EXPERIMENT_STATUS } from '../../src/config/domain';
import { ValidationError } from '../../src/core/errors';

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'トップの見出し',
    goalName: 'purchase',
    minSample: 30,
    variants: [
      { key: 'control', label: '対照', weight: 1 },
      {
        key: 'variant-b',
        label: '案B',
        weight: 1,
        payload: { selector: '#cta', text: '今すぐ申し込む', color: '#1d4ed8' },
      },
    ],
    ...overrides,
  };
}

describe('実験入力の検証（要件 3・9：不正入力は明示的に拒否し、既定値で置き換えない）', () => {
  it('正しい入力を検証済みの値として返す', () => {
    const parsed = parseExperimentInput(validBody());
    expect(parsed.name).toBe('トップの見出し');
    expect(parsed.goalName).toBe('purchase');
    expect(parsed.minSample).toBe(30);
    expect(parsed.variants).toEqual([
      { key: 'control', label: '対照', weight: 1, payload: {} },
      {
        key: 'variant-b',
        label: '案B',
        weight: 1,
        payload: { selector: '#cta', text: '今すぐ申し込む', color: '#1d4ed8' },
      },
    ]);
  });

  it('本文がオブジェクトでなければ拒否する', () => {
    expect(() => parseExperimentInput(null)).toThrow(ValidationError);
    expect(() => parseExperimentInput([])).toThrow(ValidationError);
  });

  it('未知のキーを含む場合は拒否する', () => {
    expect(() => parseExperimentInput(validBody({ owner: 'someone' }))).toThrow(ValidationError);
  });

  it('名前が空・51 文字以上なら拒否する（空白のみも空とみなす）', () => {
    expect(() => parseExperimentInput(validBody({ name: '   ' }))).toThrow(/実験名/);
    expect(() => parseExperimentInput(validBody({ name: 'あ'.repeat(51) }))).toThrow(ValidationError);
  });

  it('ゴール名が英数字・ハイフン・アンダースコア以外なら拒否する', () => {
    expect(() => parseExperimentInput(validBody({ goalName: 'buy now!' }))).toThrow(ValidationError);
    expect(() => parseExperimentInput(validBody({ goalName: '' }))).toThrow(ValidationError);
  });

  it('最小サンプル数が整数でない、または 1 未満なら拒否する（既定値 30 に置き換えない）', () => {
    expect(() => parseExperimentInput(validBody({ minSample: undefined }))).toThrow(ValidationError);
    expect(() => parseExperimentInput(validBody({ minSample: 0 }))).toThrow(ValidationError);
    expect(() => parseExperimentInput(validBody({ minSample: 1.5 }))).toThrow(ValidationError);
    expect(() => parseExperimentInput(validBody({ minSample: '30' }))).toThrow(ValidationError);
  });

  it('バリアントは 2 件から 4 件まで（要件 2）', () => {
    const one = validBody({ variants: [{ key: 'a', label: 'A', weight: 1 }] });
    expect(() => parseExperimentInput(one)).toThrow(ValidationError);
    const five = validBody({
      variants: ['a', 'b', 'c', 'd', 'e'].map((key) => ({ key, label: key, weight: 1 })),
    });
    expect(() => parseExperimentInput(five)).toThrow(ValidationError);
  });

  it('バリアントのキーが重複すれば拒否する', () => {
    const dup = validBody({
      variants: [
        { key: 'a', label: 'A', weight: 1 },
        { key: 'a', label: 'B', weight: 1 },
      ],
    });
    expect(() => parseExperimentInput(dup)).toThrow(/a/);
  });

  it.each([-1, 1.5, 101, '1', null])('配分率 %p は拒否する', (weight) => {
    const body = validBody({
      variants: [
        { key: 'a', label: 'A', weight },
        { key: 'b', label: 'B', weight: 1 },
      ],
    });
    expect(() => parseExperimentInput(body)).toThrow(ValidationError);
  });

  it('配分率 0 は受け付ける（開始時の合計検査は状態遷移で行う）', () => {
    const body = validBody({
      variants: [
        { key: 'a', label: 'A', weight: 0 },
        { key: 'b', label: 'B', weight: 0 },
      ],
    });
    expect(parseExperimentInput(body).variants.map((v) => v.weight)).toEqual([0, 0]);
  });

  it('ペイロードの色は #RRGGBB 形式のみ受け付ける', () => {
    const body = validBody({
      variants: [
        { key: 'a', label: 'A', weight: 1, payload: { color: 'red' } },
        { key: 'b', label: 'B', weight: 1 },
      ],
    });
    expect(() => parseExperimentInput(body)).toThrow(ValidationError);
  });

  it('ペイロードに未知のキーがあれば拒否する', () => {
    const body = validBody({
      variants: [
        { key: 'a', label: 'A', weight: 1, payload: { script: 'alert(1)' } },
        { key: 'b', label: 'B', weight: 1 },
      ],
    });
    expect(() => parseExperimentInput(body)).toThrow(ValidationError);
  });

  it('ハニーポット項目に値があれば拒否し、空なら通す', () => {
    expect(() => assertNoHoneypot({ website: 'http://spam.example' })).toThrow(ValidationError);
    expect(() => assertNoHoneypot({ website: '' })).not.toThrow();
    expect(() => assertNoHoneypot({})).not.toThrow();
  });
});

describe('計測・操作の入力検証', () => {
  it('公開キーは 32 文字の小文字 16 進数のみ受け付ける', () => {
    expect(parsePublicKey('a'.repeat(32))).toBe('a'.repeat(32));
    expect(() => parsePublicKey('a'.repeat(31))).toThrow(ValidationError);
    expect(() => parsePublicKey('A'.repeat(32))).toThrow(ValidationError);
    expect(() => parsePublicKey(`${'a'.repeat(31)}g`)).toThrow(ValidationError);
  });

  it('訪問者 ID は 1 から 64 文字の英数字・ハイフン・アンダースコアのみ受け付ける', () => {
    expect(parseVisitorId('visitor-01_x')).toBe('visitor-01_x');
    expect(() => parseVisitorId('')).toThrow(ValidationError);
    expect(() => parseVisitorId('a'.repeat(65))).toThrow(ValidationError);
    expect(() => parseVisitorId('a b')).toThrow(ValidationError);
  });

  it('ゴール名の検証は作成時と同じ規則に従う', () => {
    expect(parseGoalName('signup')).toBe('signup');
    expect(() => parseGoalName('sign up')).toThrow(ValidationError);
  });

  it('状態変更の指定は実行中・停止のみ受け付ける（capped・draft は指定できない）', () => {
    expect(parseTargetStatus(EXPERIMENT_STATUS.RUNNING)).toBe(EXPERIMENT_STATUS.RUNNING);
    expect(parseTargetStatus(EXPERIMENT_STATUS.PAUSED)).toBe(EXPERIMENT_STATUS.PAUSED);
    expect(() => parseTargetStatus(EXPERIMENT_STATUS.CAPPED)).toThrow(ValidationError);
    expect(() => parseTargetStatus(EXPERIMENT_STATUS.DRAFT)).toThrow(ValidationError);
    expect(() => parseTargetStatus('unknown')).toThrow(ValidationError);
  });

  it('模擬の入力は訪問者数 1〜1000 と 0〜1 の転換率を要求する', () => {
    const ok = parseSimulateInput({ visitorCount: 100, conversionRates: { a: 0.1, b: 0 } });
    expect(ok).toEqual({ visitorCount: 100, conversionRates: { a: 0.1, b: 0 } });
    expect(() => parseSimulateInput({ visitorCount: 0, conversionRates: {} })).toThrow(ValidationError);
    expect(() => parseSimulateInput({ visitorCount: 1001, conversionRates: {} })).toThrow(ValidationError);
    expect(() => parseSimulateInput({ visitorCount: 10, conversionRates: { a: 1.5 } })).toThrow(ValidationError);
    expect(() => parseSimulateInput({ visitorCount: 10 })).toThrow(ValidationError);
  });
});
