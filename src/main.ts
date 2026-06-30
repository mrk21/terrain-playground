import "./style.css";
import "./hud.css";
import { throwOnNullable } from "./core/assert";
import { createContext, resizeToDisplay } from "./visualization/gl/context";
import type { Scene, SceneFactory } from "./visualization/scenes/scene";
import { createSceneHeightmap } from "./visualization/scenes/scene-heightmap";
import { createSceneHeightmap3D } from "./visualization/scenes/scene-heightmap3d";
import { initCameraControls } from "./visualization/ui/camera-controls";
import { initControls, type ViewKey } from "./visualization/ui/controls";
import { initScaleBar } from "./visualization/ui/scale-bar";

const canvas = throwOnNullable(
  document.querySelector<HTMLCanvasElement>("#gl"),
  "#gl canvas が見つかりません。",
);
const gl = createContext(canvas);

// ビュー（2D/3D）ごとのシーンファクトリ。どちらも高さ関数を受け取る。
const factories: Record<ViewKey, SceneFactory> = {
  "3d": createSceneHeightmap3D,
  "2d": createSceneHeightmap,
};

let current: Scene;

// UI（タブ・2D/3D・パラメータ）を組み立てる。状態変化はコールバックで受ける。
const { view, height } = initControls({
  // ビュー切替はシーン型が変わるので作り直す。
  onView(nextView, nextHeight) {
    current.dispose();
    current = factories[nextView](gl, nextHeight);
  },
  // ジェネレータ/パラメータ変更はカメラを保ったまま反映する。
  onHeight(nextHeight) {
    current.setHeight(nextHeight);
  },
});

current = factories[view](gl, height);

// 方位磁針・初期位置リセット。カメラ操作は現在のシーンに委ねる。
const camera = initCameraControls({
  onResetView() {
    current.resetView();
  },
  onResetNorth() {
    current.resetNorth();
  },
});

// --- マウス位置の座標・標高 HUD ---
// canvas 相対 CSS px で最後のポインタ位置を持ち、毎フレーム worldAt で引き直す
// （マウスが止まっていてもパン/ズーム/回転で下の地点が変わるため）。
const coords = document.querySelector<HTMLElement>("#coords");
let pointer: { x: number; y: number } | null = null;

canvas.addEventListener("pointermove", (e) => {
  const r = canvas.getBoundingClientRect();
  pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
});
canvas.addEventListener("pointerleave", () => {
  pointer = null;
});

function updateCoords(): void {
  if (!coords) return;
  const p = pointer && current.worldAt(pointer.x, pointer.y);
  // 地形外（canvas 外・3D の地平線上）は空にして枠を隠す（#coords:empty）。
  coords.textContent = p
    ? `X ${Math.round(p.x)}　Z ${Math.round(p.z)}　標高 ${p.height.toFixed(1)}`
    : "";
}

// 縮尺バー。ズーム（worldPerPixel）に応じてバー幅とラベルを毎フレーム更新する。
const scaleBar = initScaleBar();

// --- 描画ループ ---
let startTime: number | null = null;
// E2E（Playwright）が描画完了を待ち、画を固定してスクショするためのフック。
// settledFrames: LOD が連続収束しているフレーム数（scene.ts の isSettled() 参照）。
// freeze(): 描画ループを止めて最後のフレームで固定する（preserveDrawingBuffer により
// バッファが残る）。連続再描画による安定待ちの失敗や MSAA のフレーム間ノイズを避ける。
// いずれも本番のロジックには影響しない（本番から freeze() は呼ばれない）。
let settledFrames = 0;
let running = true;
function frame(now: number): void {
  if (!running) return;
  if (startTime === null) startTime = now;
  const time = (now - startTime) / 1000;

  resizeToDisplay(canvas);
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  current.render(time);
  camera.setHeading(current.getHeading());
  updateCoords();
  scaleBar.update(current.worldPerPixel());

  settledFrames = current.isSettled() ? settledFrames + 1 : 0;
  window.__terrain = {
    settledFrames,
    freeze() {
      running = false;
    },
  };

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
