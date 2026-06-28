/** Canvas から WebGL2 コンテキストを取得する。 */
export function createContext(
  canvas: HTMLCanvasElement,
): WebGL2RenderingContext {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    // 描画後もバッファを保持し、フレーム外からピクセルを読み出せるようにする。
    // これが無いと WebGL canvas のスクショが空になる（E2E の視覚回帰・README 用
    // ショットがこれに依存。画像書き出し等にも使える）。
    preserveDrawingBuffer: true,
  });
  if (!gl) {
    throw new Error("WebGL2 がこのブラウザでサポートされていません。");
  }
  return gl;
}

/**
 * 描画バッファのサイズを CSS 上の表示サイズ（× devicePixelRatio）に合わせる。
 * サイズが変化したときだけ true を返すので、呼び出し側で再設定の判断に使える。
 */
export function resizeToDisplay(canvas: HTMLCanvasElement): boolean {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}
