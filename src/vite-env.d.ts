/// <reference types="vite/client" />

interface Window {
  /**
   * E2E（Playwright）が描画の収束を待ち、画を固定してスクショするためのフック。
   * 本番のロジックには影響しない。
   *   - settledFrames: LOD が連続で収束しているフレーム数。
   *   - freeze(): 描画ループを止めて最後のフレームで固定する。
   */
  __terrain?: { settledFrames: number; freeze(): void };
}
