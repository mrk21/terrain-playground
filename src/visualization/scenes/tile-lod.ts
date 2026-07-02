/**
 * 2D タイルピラミッド（クアッドツリー）LOD の環境非依存な計算。
 * レベル選択・焦点固定ズーム・タイルの可視判定を、素の数値だけで行う。
 */
import { clamp } from "../../core/math/scalar";

/** 真上ビューの状態（中心ワールド座標と、縦方向に映すワールド長）。 */
export interface ViewState {
  centerX: number;
  centerZ: number;
  viewHeight: number;
  /**
   * 地図の回転角（ラジアン）。0 で北が上（既定の真上ビュー）。3D の yaw と同じ向きで、
   * 増えると地図が回る。省略時は 0（回転なし）として扱う。
   */
  heading?: number;
}

/**
 * 画面オフセット（canvas 上の px 方向、右が +sx・下が +sy）を、heading だけ回した
 * ビューでのワールド方向 [dx,dz] に写す（長さはそのまま）。screenToWorld・焦点固定ズーム・
 * 回転がすべてこの 1 つの回転を共有する。
 *   screenRight = (cosθ, sinθ), screenDown = (−sinθ, cosθ)
 * heading=0 なら (dx,dz)=(sx,sy) で、従来の軸そろいの真上ビューに一致する。
 */
export function screenOffsetToWorld(
  sx: number,
  sy: number,
  heading: number,
): { dx: number; dz: number } {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return {
    dx: sx * c - sy * s, // sx*right.x + sy*down.x
    dz: sx * s + sy * c, // sx*right.z + sy*down.z
  };
}

/**
 * 「1 テクセル ≒ 1 ピクセル」になる LOD レベルを選ぶ。
 * texelWorld(L) = baseTileWorld / 2^L / tileRes を worldPerPixel に合わせ、log2 を四捨五入する。
 */
export function selectTileLevel(
  viewHeight: number,
  drawingBufferHeight: number,
  baseTileWorld: number,
  tileRes: number,
  maxLevel: number,
): number {
  const worldPerPixel = viewHeight / drawingBufferHeight;
  const level = Math.round(
    Math.log2(baseTileWorld / (tileRes * worldPerPixel)),
  );
  return clamp(level, 0, maxLevel);
}

/**
 * 画面ピクセル (fx,fy)（canvas 相対 CSS px）の真下にあるワールド座標 [x,z]。
 * 真上ビューなので worldPerPx = viewHeight/h を縦横共通に使う（halfX = halfY*aspect のため）。
 * 焦点固定ズーム・HUD のマウス座標表示が共有する単一の出所。
 */
export function screenToWorld(
  state: ViewState,
  fx: number,
  fy: number,
  w: number,
  h: number,
): { x: number; z: number } {
  const worldPerPx = state.viewHeight / h;
  const { dx, dz } = screenOffsetToWorld(
    fx - w / 2,
    fy - h / 2,
    state.heading ?? 0,
  );
  return {
    x: state.centerX + dx * worldPerPx,
    z: state.centerZ + dz * worldPerPx,
  };
}

/**
 * 焦点 (fx,fy)（canvas 相対 CSS px）の地点が動かないようにズームした新しいビュー状態。
 * factor>1 で拡大（viewHeight を縮める）。Google Maps の「指の下が動かない」挙動。
 * viewHeight は [minViewHeight, maxViewHeight] にクランプする。
 */
export function zoomAtFocus(
  state: ViewState,
  factor: number,
  fx: number,
  fy: number,
  w: number,
  h: number,
  minViewHeight: number,
  maxViewHeight: number,
): ViewState {
  // ズーム前の焦点下ワールド座標を固定したまま viewHeight だけ変える。
  const heading = state.heading ?? 0;
  const { x: wx, z: wz } = screenToWorld(state, fx, fy, w, h);
  const viewHeight = clamp(
    state.viewHeight / factor,
    minViewHeight,
    maxViewHeight,
  );
  const wppAfter = viewHeight / h;
  const { dx, dz } = screenOffsetToWorld(fx - w / 2, fy - h / 2, heading);
  return {
    centerX: wx - dx * wppAfter,
    centerZ: wz - dz * wppAfter,
    viewHeight,
    heading,
  };
}

/**
 * 焦点 (fx,fy)（canvas 相対 CSS px）の地点を固定したまま heading を dHeading だけ回した
 * 新しいビュー状態。Google Maps の 2 本指ツイスト（指の下が動かないまま地図が回る）挙動。
 * viewHeight は変えない。
 */
export function rotateViewAround(
  state: ViewState,
  dHeading: number,
  fx: number,
  fy: number,
  w: number,
  h: number,
): ViewState {
  // 回転前に焦点の下にあったワールド地点を、回転後も同じ画面位置に置き直す。
  const { x: wx, z: wz } = screenToWorld(state, fx, fy, w, h);
  const heading = (state.heading ?? 0) + dHeading;
  const wpp = state.viewHeight / h;
  const { dx, dz } = screenOffsetToWorld(fx - w / 2, fy - h / 2, heading);
  return {
    centerX: wx - dx * wpp,
    centerZ: wz - dz * wpp,
    viewHeight: state.viewHeight,
    heading,
  };
}

/**
 * heading だけ回した表示矩形（画面半幅 halfX×halfZ）を、軸そろいのワールド矩形で覆う
 * ための半幅 [halfX,halfZ]。回転した矩形の外接軸並行 AABB。可視タイル選択の範囲に使う
 * （回転時は角のぶん広がる。heading=0 なら入力そのまま）。
 */
export function viewAabbHalfExtents(
  halfX: number,
  halfZ: number,
  heading: number,
): { halfX: number; halfZ: number } {
  const c = Math.abs(Math.cos(heading));
  const s = Math.abs(Math.sin(heading));
  return {
    halfX: halfX * c + halfZ * s,
    halfZ: halfX * s + halfZ * c,
  };
}

/**
 * 原点 (ox,oz)・一辺 tileWorld のタイルが可視範囲 [ax0,ax1]×[az0,az1] と重なるか。
 * 辺で接するだけ（重なり 0）は不可視扱い（半開区間）。
 */
export function tileVisible(
  ox: number,
  oz: number,
  tileWorld: number,
  ax0: number,
  ax1: number,
  az0: number,
  az1: number,
): boolean {
  return !(
    ox >= ax1 ||
    ox + tileWorld <= ax0 ||
    oz >= az1 ||
    oz + tileWorld <= az0
  );
}
