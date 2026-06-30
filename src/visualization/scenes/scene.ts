import type { HeightMapFunc } from "../../algorithm/height";

/** 画面上の点が指すワールド地点（座標とその標高）。 */
export interface SurfacePoint {
  /** ワールド座標 x。 */
  x: number;
  /** ワールド座標 z。 */
  z: number;
  /** その地点の標高 height(x, z)（色付け前の生の高さ）。 */
  height: number;
}

/** 描画シーンの共通インターフェイス。 */
export interface Scene {
  /** 経過秒数を受け取って 1 フレーム描画する。 */
  render(timeSeconds: number): void;
  /**
   * 画面上の点 (screenX, screenY)（canvas 相対 CSS px）が指すワールド地点と標高。
   * HUD のマウス座標表示に使う。地表と交わらない（3D で地平線より上を指す）場合は null。
   */
  worldAt(screenX: number, screenY: number): SurfacePoint | null;
  /**
   * 画面中心まわりでの「ワールド長 / CSS ピクセル」。スケールバー（縮尺）に使う。
   * 2D は一様。3D は注視点の奥行きでの値（真上ビューで正確、傾けると近似）。
   */
  worldPerPixel(): number;
  /** 高さ関数を差し替える（キャッシュを破棄し、次フレームで再生成する）。 */
  setHeight(height: HeightMapFunc): void;
  /** カメラを初期位置・初期アングル・初期ズームに戻す。 */
  resetView(): void;
  /** 向きだけ北上・真上にリセットする（位置・ズームは保つ）。方位磁針クリック用。 */
  resetNorth(): void;
  /** 現在の方位角（ラジアン。0 = 北が画面上）。方位磁針の針の向きに使う。 */
  getHeading(): number;
  /**
   * 直近の render() で LOD が目標解像度まで収束したか（粗いフォールバックや
   * 未生成タイルが残っていない＝これ以上待っても絵が変わらない状態）。
   * E2E がスクショ撮影の前に描画完了を待つために使う。
   */
  isSettled(): boolean;
  /** GL リソースを解放する。 */
  dispose(): void;
}

/** gl と高さ関数から Scene を生成するファクトリ。 */
export type SceneFactory = (
  gl: WebGL2RenderingContext,
  height: HeightMapFunc,
) => Scene;
