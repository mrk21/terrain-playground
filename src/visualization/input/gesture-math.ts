/** ジェスチャ認識の環境非依存な幾何計算（canvas 相対 CSS px の素の点を扱う）。 */

/** canvas 左上を原点とする CSS ピクセル座標の点。 */
export interface Point {
  x: number;
  y: number;
}

/** 2 本指の状態。 */
export interface TwoFingerGesture {
  /** 重心 x。 */
  cx: number;
  /** 重心 y。 */
  cy: number;
  /** 指の間隔。0（2 点一致）のときは 0 除算回避のため 1 に丸める。 */
  dist: number;
  /** a→b 方向の角度（ラジアン、時計回りが正）。 */
  angle: number;
}

/** 2 点から重心・間隔・角度を取り出す。 */
export function twoFingerGesture(a: Point, b: Point): TwoFingerGesture {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    dist: Math.hypot(dx, dy) || 1,
    angle: Math.atan2(dy, dx),
  };
}
