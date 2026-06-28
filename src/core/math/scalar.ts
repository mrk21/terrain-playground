/** スカラー（単一の数値）に対する汎用ユーティリティ。 */

/** v を [min, max] に収める。 */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * 角度の差分を半開区間 (-π, π] に折り返す。
 * 1 フレーム間のひねり量など |d| < 2π を想定した 1 段補正で、atan2 の不連続
 * （±π でのジャンプ）を跨いだときに最短回り側の符号付き差分へ直す。
 */
export function wrapAngleDelta(d: number): number {
  if (d > Math.PI) return d - 2 * Math.PI;
  if (d < -Math.PI) return d + 2 * Math.PI;
  return d;
}
