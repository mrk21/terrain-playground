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

/** ワールド空間のレイ。origin（カメラの目）と direction（未正規化）。 */
interface Ray {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

/**
 * 画面上の点 (fx,fy)（canvas 相対 CSS px）を通る視線レイ。origin はカメラの目
 * eye = target - forward*dist、direction は NDC を逆投影した向き（未正規化）。
 */
function screenRay(
  cam: CameraOrient & { target: readonly [number, number, number] },
  viewport: { w: number; h: number },
  screen: readonly [number, number],
  dist: number,
): Ray {
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
  return {
    ox: target[0] - fX * dist, // eye = target - forward*dist
    oy: target[1] - fY * dist,
    oz: target[2] - fZ * dist,
    dx: fX + rX * ax + uX * ay,
    dy: fY + uY * ay,
    dz: fZ + rZ * ax + uZ * ay,
  };
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
  const { ox, oy, oz, dx, dy, dz } = screenRay(cam, viewport, screen, dist);
  if (dy > -1e-4) return null; // 下を向いていない＝地表と交わらない
  const tHit = (cam.target[1] - oy) / dy;
  if (tHit <= 0) return null;
  return [ox + dx * tHit, oz + dz * tHit];
}

/**
 * カメラからマウス方向へレイを飛ばし、起伏のある地表面 surfaceY(x,z) との
 * 最も手前の交点のワールド [x,z] を返す（ハイトフィールドのレイマーチ）。
 *
 * groundUnder は平面 y=target.y との交差なので真上ビュー専用の近似だが、こちらは
 * 実際の地表の高さと交わるので、斜めから見てもマウス直下の地点を正しく返す。
 * band = 地表面 surfaceY の値域 [minY, maxY]。レイがこの高さ帯を通る区間だけを
 * 探索して無駄打ちを省く。地表と交わらない（空・地平線を指す）場合は null。
 *
 * maxDistance はレイ長（ワールド距離）の上限。描画は far クリップ（FAR）でその先を
 * 描かないので、そこを渡せば「見えていない遠方地形」を拾わずに済み、HUD と絵が
 * 一致する（画面中心では far 面とほぼ一致、画面端では近似で少し手前で切れる）。
 * 既定は無限（打ち切らない）。
 *
 * レイを粗く進めて「地表より上→下」に切り替わる区間を見つけ、二分探索で交点を
 * 詰める。マウス 1 本ぶんを毎フレーム引くだけなので、多少細かく刻んでも十分軽い。
 * 刻み幅より細い地形（最小オクターブの微細な凹凸）は跨ぐことがあるが、座標表示の
 * 目安としては十分。
 */
export function raycastSurface(
  cam: CameraOrient & { target: readonly [number, number, number] },
  viewport: { w: number; h: number },
  screen: readonly [number, number],
  dist: number,
  surfaceY: (x: number, z: number) => number,
  band: { minY: number; maxY: number },
  maxDistance = Number.POSITIVE_INFINITY,
): [number, number] | null {
  const { ox, oy, oz, dx, dy, dz } = screenRay(cam, viewport, screen, dist);
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) return null;
  const nx = dx / len,
    ny = dy / len,
    nz = dz / len; // 単位方向（t = ワールド距離）

  const interval = bandInterval(oy, ny, band);
  if (!interval) return null;
  const [tNear, tFarBand] = interval;
  const tFar = Math.min(tFarBand, maxDistance); // 描画距離で打ち切る
  if (!(tNear < tFar) || !Number.isFinite(tFar)) return null;

  // f(t) = レイの高さ − 地表面の高さ。正なら地表より上、負なら下。
  const f = (t: number): number =>
    oy + ny * t - surfaceY(ox + nx * t, oz + nz * t);

  const STEP = 1; // 粗探索の刻み（ワールド長）。
  const MAX_STEPS = 2048;
  const span = tFar - tNear;
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(span / STEP)));
  const dt = span / steps;

  let tPrev = tNear;
  let fPrev = f(tPrev);
  for (let i = 1; i <= steps; i++) {
    const t = tNear + dt * i;
    const fCur = f(t);
    if (fPrev > 0 && fCur <= 0) {
      const tHit = refineHit(f, tPrev, t);
      return [ox + nx * tHit, oz + nz * tHit];
    }
    tPrev = t;
    fPrev = fCur;
  }
  return null; // 高さ帯を通り抜けても地表と交わらなかった
}

/**
 * レイの高さ oy + ny*t が band=[minY,maxY] に入っている t の区間 [tNear, tFar]。
 * 交わらない（水平で帯の外／前方に帯が来ない）場合は null。tNear は 0 以上に丸める。
 */
function bandInterval(
  oy: number,
  ny: number,
  band: { minY: number; maxY: number },
): [number, number] | null {
  if (Math.abs(ny) < 1e-9) {
    // 水平なレイ：起点が帯の中にあるときだけ通る（前方無限までが対象）。
    return oy < band.minY || oy > band.maxY
      ? null
      : [0, Number.POSITIVE_INFINITY];
  }
  const ta = (band.maxY - oy) / ny;
  const tb = (band.minY - oy) / ny;
  const tNear = Math.max(0, Math.min(ta, tb));
  const tFar = Math.max(ta, tb);
  return tNear < tFar && Number.isFinite(tFar) ? [tNear, tFar] : null;
}

/** f(lo)>0・f(hi)≤0 の区間を二分探索して交点の t を返す。 */
function refineHit(f: (t: number) => number, lo: number, hi: number): number {
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
