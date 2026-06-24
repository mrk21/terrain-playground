/**
 * イージング関数（easing function）: 補間パラメータ t ∈ [0,1] を [0,1] に再マッピングする。
 * f(0) = 0, f(1) = 1 を満たす。`interpolate` の補間カーブとして渡す。
 */
export type EasingFunction = (t: number) => number;

/**
 * f(t) = t
 * 線形補間
 */
export function easeLinear(t: number): number {
  return t;
}

/**
 * smoothstep: f(t) = 3t² - 2t³
 * 端点で 1階微分が 0（C¹ 連続）の S 字カーブ。
 * いわゆる ease-in-out。Perlin が improved noise で採用した fade の簡易版。
 */
export function easeSmoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * smootherstep: f(t) = 6t⁵ - 15t⁴ + 10t³
 * 端点で 2階微分まで 0（C² 連続）。Perlin が improved noise で採用した fade。
 */
export function easeSmootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * a->b を f(t) を用いて補間する
 * @param a [number] 補間の開始値
 * @param b [number] 補間の終了値
 * @param t [number] 補間の割合（0〜1）
 * @param f [EasingFunction] イージング関数（補間カーブ）
 * @returns [number] 補間後の値
 */
export function interpolate(
  a: number,
  b: number,
  t: number,
  f: EasingFunction,
): number {
  return a + (b - a) * f(t);
}
