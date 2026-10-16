import { normalCdf, twoProportionZTest } from '../../src/core/stats';

describe('normalCdf（標準正規分布の累積分布関数）', () => {
  it('0 では 0.5 を返す', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 12);
  });

  it('既知の値と一致する', () => {
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021, 6);
    expect(normalCdf(-1.96)).toBeCloseTo(0.0249979, 6);
    expect(normalCdf(3)).toBeCloseTo(0.9986501, 6);
  });

  it('対称性を満たす（Φ(x) + Φ(-x) = 1）', () => {
    expect(normalCdf(0.7) + normalCdf(-0.7)).toBeCloseTo(1, 12);
  });

  it('極端な値では 0 または 1 に近づく', () => {
    expect(normalCdf(-10)).toBeLessThan(1e-20);
    expect(normalCdf(10)).toBeCloseTo(1, 12);
  });
});

describe('twoProportionZTest（二標本比率の z 検定）', () => {
  it('プール比率が 0 のときは null を返す', () => {
    expect(twoProportionZTest(0, 100, 0, 100)).toBeNull();
  });

  it('プール比率が 1 のときは null を返す', () => {
    expect(twoProportionZTest(100, 100, 50, 50)).toBeNull();
  });

  it('同じ転換率なら z = 0、p = 1 を返す', () => {
    const result = twoProportionZTest(50, 500, 50, 500);
    expect(result).not.toBeNull();
    expect(result?.z).toBeCloseTo(0, 12);
    expect(result?.pValue).toBeCloseTo(1, 12);
  });

  it('手計算の例（10% 対 13%、各 1000 件）と一致する', () => {
    const result = twoProportionZTest(100, 1000, 130, 1000);
    expect(result).not.toBeNull();
    expect(result?.z).toBeCloseTo(2.1027, 3);
    expect(result?.pValue).toBeCloseTo(0.0355, 3);
  });

  it('符号は（対象 − 対照）の向きに従う', () => {
    const result = twoProportionZTest(130, 1000, 100, 1000);
    expect(result?.z).toBeLessThan(0);
  });
});
