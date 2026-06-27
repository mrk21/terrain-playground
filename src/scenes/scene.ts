import type { HeightMapFunc } from '../heightmap/height'

/** 描画シーンの共通インターフェイス。 */
export interface Scene {
  /** 経過秒数を受け取って 1 フレーム描画する。 */
  render(timeSeconds: number): void
  /** 高さ関数を差し替える（キャッシュを破棄し、次フレームで再生成する）。 */
  setHeight(height: HeightMapFunc): void
  /** カメラを初期位置・初期アングル・初期ズームに戻す。 */
  resetView(): void
  /** 向きだけ北上・真上にリセットする（位置・ズームは保つ）。方位磁針クリック用。 */
  resetNorth(): void
  /** 現在の方位角（ラジアン。0 = 北が画面上）。方位磁針の針の向きに使う。 */
  getHeading(): number
  /** GL リソースを解放する。 */
  dispose(): void
}

/** gl と高さ関数から Scene を生成するファクトリ。 */
export type SceneFactory = (
  gl: WebGL2RenderingContext,
  height: HeightMapFunc,
) => Scene
