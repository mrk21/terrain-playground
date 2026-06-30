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
  return {
    x: state.centerX + (fx - w / 2) * worldPerPx,
    z: state.centerZ + (fy - h / 2) * worldPerPx,
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
  const { x: wx, z: wz } = screenToWorld(state, fx, fy, w, h);
  const viewHeight = clamp(
    state.viewHeight / factor,
    minViewHeight,
    maxViewHeight,
  );
  const wppAfter = viewHeight / h;
  return {
    centerX: wx - (fx - w / 2) * wppAfter,
    centerZ: wz - (fy - h / 2) * wppAfter,
    viewHeight,
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
