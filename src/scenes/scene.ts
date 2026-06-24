/** 描画シーンの共通インターフェイス。 */
export interface Scene {
  /** 経過秒数を受け取って 1 フレーム描画する。 */
  render(timeSeconds: number): void
  /** GL リソースを解放する。 */
  dispose(): void
}

/** gl とシェーダ等から Scene を生成するファクトリ。 */
export type SceneFactory = (gl: WebGL2RenderingContext) => Scene
