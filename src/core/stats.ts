const SQRT_2PI = Math.sqrt(2 * Math.PI);
/** この絶対値を超えると、標準正規分布の裾は倍精度で表現できる誤差の範囲で 0 または 1 になる。 */
const TAIL_CUTOFF = 10;

/**
 * 標準正規分布の累積分布関数 Φ(x)。
 * 0 を中心とするテイラー級数（全項が正のため桁落ちしない）で計算する。
 */
export function normalCdf(x: number): number {
  if (x >= TAIL_CUTOFF) {
    return 1;
  }
  if (x <= -TAIL_CUTOFF) {
    return 0;
  }
  const magnitude = Math.abs(x);
  const density = Math.exp((-magnitude * magnitude) / 2) / SQRT_2PI;
  let term = magnitude;
  let sum = magnitude;
  for (let n = 1; n < 500; n += 1) {
    term *= (magnitude * magnitude) / (2 * n + 1);
    sum += term;
    if (term < sum * 1e-17) {
      break;
    }
  }
  const upperHalf = 0.5 + density * sum;
  return x >= 0 ? upperHalf : 1 - upperHalf;
}

export interface TwoProportionResult {
  readonly z: number;
  readonly pValue: number;
}

/**
 * 二標本比率の z 検定（プール比率を用いる両側検定）。
 * プール比率が 0 または 1 のときは標準誤差が 0 になるため null を返す。
 */
export function twoProportionZTest(
  conversionsA: number,
  exposuresA: number,
  conversionsB: number,
  exposuresB: number,
): TwoProportionResult | null {
  const pooled = (conversionsA + conversionsB) / (exposuresA + exposuresB);
  if (pooled <= 0 || pooled >= 1) {
    return null;
  }
  const rateA = conversionsA / exposuresA;
  const rateB = conversionsB / exposuresB;
  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / exposuresA + 1 / exposuresB));
  const z = (rateB - rateA) / standardError;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { z, pValue };
}
