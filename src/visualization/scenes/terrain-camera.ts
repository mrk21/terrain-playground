/**
 * 3D 地形シーンのカメラ投影まわりの純粋計算（GL/DOM 非依存）。
 * 視点位置と「画面の点が刺さる地表座標」を素の数値だけで出すので、ここだけで TDD できる。
 * 可変なカメラ状態（yaw/pitch/distance/target）は scene 側が持ち、計算だけ委譲する。
 */

/** カメラの向き（ヨー・ピッチ）と画角。 */
export interface CameraOrient {
  yaw: number;
  pitch: number;
  fov: number;
}

/**
 * 注視点 target・向き・距離からカメラの目（eye）のワールド座標を出す。
 * eye = target - forward*distance（forward は yaw,pitch から定まる単位ベクトル）。
 */
export function eyePosition(
  orient: { yaw: number; pitch: number },
  target: readonly [number, number, number],
  distance: number,
): [number, number, number] {
  const cp = Math.cos(orient.pitch);
  return [
    target[0] - Math.sin(orient.yaw) * cp * distance,
    target[1] + Math.sin(orient.pitch) * distance,
    target[2] + Math.cos(orient.yaw) * cp * distance,
  ];
}

/**
 * 画面上の点 (fx,fy)（canvas 相対 CSS px）が刺さる地表面 y=target.y のワールド [x,z]。
 * ピンチで「指の下が動かない」ようにズーム量を合わせるのに使う。視線が上を向く
 * （地平線より上）など交わらない場合は null。dist を引数に取り、ズーム前後で使える。
 */
export function groundUnder(
  cam: CameraOrient & { target: readonly [number, number, number] },
  viewport: { w: number; h: number },
  screen: readonly [number, number],
  dist: number,
): [number, number] | null {
  const { yaw, pitch, fov, target } = cam;
  const { w, h } = viewport;
  const [fx, fy] = screen;
  const aspect = w / h;
  const t2 = Math.tan(fov / 2);
  const ndcX = (fx / w) * 2 - 1;
  const ndcY = 1 - (fy / h) * 2;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // カメラの正規直交基底（yaw,pitch から直接。真上ビューでも退化しない）。
  const fX = Math.sin(yaw) * cp,
    fY = -sp,
    fZ = -Math.cos(yaw) * cp; // forward
  const rX = Math.cos(yaw),
    rZ = Math.sin(yaw); // right（y成分は常に0）
  const uX = Math.sin(yaw) * sp,
    uY = cp,
    uZ = -Math.cos(yaw) * sp; // up
  const ax = ndcX * t2 * aspect;
  const ay = ndcY * t2;
  const dx = fX + rX * ax + uX * ay;
  const dy = fY + uY * ay;
  const dz = fZ + rZ * ax + uZ * ay;
  if (dy > -1e-4) return null; // 下を向いていない＝地表と交わらない
  const ex = target[0] - fX * dist; // eye = target - forward*dist
  const ey = target[1] - fY * dist;
  const ez = target[2] - fZ * dist;
  const tHit = (target[1] - ey) / dy;
  if (tHit <= 0) return null;
  return [ex + dx * tHit, ez + dz * tHit];
}
