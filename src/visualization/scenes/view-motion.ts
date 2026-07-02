/**
 * 視点が「速く動いているか」の判定（環境非依存の純粋計算）。
 *
 * 速く動いている間はタイル生成を絞ってフレームを軽く保ち（粗いまま滑らせ）、
 * 止まったら通常予算で細部を焼き直して鮮明化する——という「動作中は品質を落とす」
 * 最適化に使う。Google Maps の「速いパン中はぼやけ、止めるとくっきり」と同じ考え。
 */

/** 判定に使う視点の姿勢（注視点 x,z・距離・yaw・pitch）。 */
export interface CameraPose {
  tx: number;
  tz: number;
  distance: number;
  yaw: number;
  pitch: number;
}

/** 「速い」とみなす 1 フレームあたりの変化量のしきい値。 */
export interface MotionThresholds {
  /** パン（注視点移動）の画面速度（CSS px/frame）。 */
  panPx: number;
  /** ズーム（距離の対数変化）/frame。 */
  zoomLog: number;
  /** 回転（|Δyaw|+|Δpitch|）rad/frame。 */
  rotRad: number;
}

/**
 * 前フレーム prev から現フレーム cur への視点変化が「速い」か。
 * パンは画面ピクセル換算（worldPerPixel で割る）で見るので、ズーム状態に依らず
 * 同じ体感速度で判定できる。いずれかの軸がしきい値を超えたら true。
 */
export function viewMovedFast(
  prev: CameraPose,
  cur: CameraPose,
  worldPerPixel: number,
  th: MotionThresholds,
): boolean {
  const panPx = Math.hypot(cur.tx - prev.tx, cur.tz - prev.tz) / worldPerPixel;
  const zoomLog = Math.abs(Math.log(cur.distance / prev.distance));
  const rot = Math.abs(cur.yaw - prev.yaw) + Math.abs(cur.pitch - prev.pitch);
  return panPx > th.panPx || zoomLog > th.zoomLog || rot > th.rotRad;
}
