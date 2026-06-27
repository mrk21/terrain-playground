/**
 * 高さ y (0〜128) を RGB 色 (各 0〜255) に変換するカラーマップ。
 *
 *   y <  64 : 青系。低いほど濃い（深い）青、64 に近いほど明るい青。
 *   y >= 64 : 緑 → 焦茶。高いほど焦茶に近づく。
 *
 * 色の段階は下の定数を書き換えれば自由に調整できる。
 */

export type RGB = [r: number, g: number, b: number]

/** 水面の高さ。これ未満が水（青系）、以上が陸（緑〜焦茶）。 */
export const WATER_LEVEL = 64
/** y の最大値。 */
export const MAX_HEIGHT = 128

// 青系（深い → 浅い）
const DEEP_WATER: RGB = [5, 15, 60]
const SHALLOW_WATER: RGB = [70, 150, 230]
// 陸（緑 → 焦茶）
const LOWLAND_GREEN: RGB = [90, 160, 70]
const DARK_BROWN: RGB = [74, 44, 20]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

export function heightToColor(y: number): RGB {
  if (y < WATER_LEVEL) {
    const t = clamp01(y / WATER_LEVEL) // 0(深い) → 1(浅い)
    return mix(DEEP_WATER, SHALLOW_WATER, t)
  }
  const t = clamp01((y - WATER_LEVEL) / (MAX_HEIGHT - WATER_LEVEL)) // 0(緑) → 1(焦茶)
  return mix(LOWLAND_GREEN, DARK_BROWN, t)
}
