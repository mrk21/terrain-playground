import type { HeightMapFunc } from "../../algorithm/height";
import { createProgram } from "../gl/shader";
import { attachGestures } from "../input/gestures";
import fragSrc from "../shaders/tile.frag?raw";
import vertSrc from "../shaders/tile.vert?raw";
import type { Scene } from "./scene";
import { screenToWorld, zoomAtFocus } from "./tile-lod";
import { createTilePyramid } from "./tile-pyramid";
import {
  type ChannelKind,
  createResetAnimator,
  RESET_ANIM_SECONDS,
} from "./view-transition";

/**
 * Google Maps 風のタイルピラミッド LOD で地形を真上から表示する 2D シーン。
 *
 * 役割分担：タイルの生成・選択・キャッシュ・退避（LOD）は tile-pyramid、真上ビューの
 * 座標変換・レベル選択・可視判定の数学は tile-lod、リセットの補間は view-transition。
 * ここはそれらを束ね、ビュー状態（中心・ズーム）とジェスチャ、描画コールを受け持つ。
 */

/** ズーム（垂直方向に映すワールド長）の初期値と上下限。 */
const DEFAULT_VIEW_HEIGHT = 200;
const MIN_VIEW_HEIGHT = 1;
const MAX_VIEW_HEIGHT = 2000;

export function createSceneHeightmap(
  gl: WebGL2RenderingContext,
  heightFunc: HeightMapFunc,
): Scene {
  // 高さ関数は setHeight() で差し替えられる。HUD のマウス標高表示にも使う。
  let height = heightFunc;
  const pyramid = createTilePyramid(gl, heightFunc);

  const program = createProgram(gl, vertSrc, fragSrc);
  // 属性なし描画でも WebGL2 では VAO のバインドが必要。
  const vao = gl.createVertexArray();

  const uTileOrigin = gl.getUniformLocation(program, "uTileOrigin");
  const uTileSize = gl.getUniformLocation(program, "uTileSize");
  const uViewCenter = gl.getUniformLocation(program, "uViewCenter");
  const uHalfSpan = gl.getUniformLocation(program, "uHalfSpan");
  const uMap = gl.getUniformLocation(program, "uMap");

  // --- ビュー状態（1本指/ドラッグでパン・ピンチ/ホイールでズーム） ---
  let centerX = 0;
  let centerZ = 0;
  let viewHeight = DEFAULT_VIEW_HEIGHT;

  // --- リセットの滑らかな遷移（初期化ボタンで初期状態へ easing。GoogleMap 風） ---
  // ズーム（viewHeight）は指数的（log）に動かすと倍率が一定率で変わり、大きな倍率差でも
  // 等速に感じる。中心はパンなので線形。
  type View = { centerX: number; centerZ: number; viewHeight: number };
  const RESET_CHANNELS: Record<keyof View, ChannelKind> = {
    centerX: "linear",
    centerZ: "linear",
    viewHeight: "log",
  };
  const resetAnim = createResetAnimator<keyof View>(
    RESET_CHANNELS,
    RESET_ANIM_SECONDS,
  );

  const canvas = gl.canvas as HTMLCanvasElement;

  // 焦点 (fx,fy)（canvas 相対 CSS px）の地点が動かないようズームする。
  // factor>1 で拡大（viewHeight を縮める）。Google Maps の「指の下が動かない」挙動。
  const zoomAt = (factor: number, fx: number, fy: number): void => {
    const next = zoomAtFocus(
      { centerX, centerZ, viewHeight },
      factor,
      fx,
      fy,
      canvas.clientWidth,
      canvas.clientHeight,
      MIN_VIEW_HEIGHT,
      MAX_VIEW_HEIGHT,
    );
    centerX = next.centerX;
    centerZ = next.centerZ;
    viewHeight = next.viewHeight;
  };

  const gestures = attachGestures(canvas, {
    onDrag(dx, dy) {
      // 中身が指に追従するよう中心を逆に動かす（水平・垂直で同じスケール）。
      const worldPerPx = viewHeight / canvas.clientHeight;
      centerX -= dx * worldPerPx;
      centerZ -= dy * worldPerPx;
    },
    onPinch(scale, fx, fy) {
      zoomAt(scale, fx, fy);
    },
    onWheelZoom(deltaY, fx, fy) {
      zoomAt(Math.exp(-deltaY * 0.001), fx, fy);
    },
    onUserInput() {
      // 手動操作が入ったらリセットの遷移アニメを打ち切り、以降は指の操作に委ねる。
      resetAnim.cancel();
    },
  });

  // 現在のビューから to へ滑らかに遷移させる（滑走中の慣性は止める）。
  const startTransition = (to: View): void => {
    gestures.cancelInertia();
    resetAnim.start({ centerX, centerZ, viewHeight }, to);
  };

  const hud = document.querySelector<HTMLElement>("#hud");

  return {
    render(timeSeconds) {
      // リセットの遷移アニメ中ならビューを進める（アニメ中でなければ null で何もしない）。
      const animated = resetAnim.sample(timeSeconds);
      if (animated) {
        centerX = animated.centerX;
        centerZ = animated.centerZ;
        viewHeight = animated.viewHeight;
      }

      gl.disable(gl.DEPTH_TEST);
      gl.clearColor(0.04, 0.04, 0.05, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
      const { level, visible } = pyramid.update({
        centerX,
        centerZ,
        viewHeight,
        drawingBufferHeight: gl.drawingBufferHeight,
        aspect,
      });
      const halfY = viewHeight / 2;
      const halfX = halfY * aspect;

      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(uViewCenter, centerX, centerZ);
      gl.uniform2f(uHalfSpan, halfX, halfY);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(uMap, 0);
      for (const tile of visible) {
        gl.uniform2f(uTileOrigin, tile.ox, tile.oz);
        gl.uniform1f(uTileSize, tile.tileWorld);
        gl.bindTexture(gl.TEXTURE_2D, tile.texture);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.bindVertexArray(null);

      if (hud) hud.textContent = `lv: ${level} | tiles: ${pyramid.size}`;
    },
    worldAt(screenX, screenY) {
      const { x, z } = screenToWorld(
        { centerX, centerZ, viewHeight },
        screenX,
        screenY,
        canvas.clientWidth,
        canvas.clientHeight,
      );
      return { x, z, height: height(x, z) };
    },
    worldPerPixel() {
      // 真上ビューなので一様（pan の worldPerPx と同じ）。
      return viewHeight / canvas.clientHeight;
    },
    setHeight(next) {
      height = next;
      pyramid.setHeight(next);
    },
    resetView() {
      // 初期位置・初期ズームへ滑らかに戻す（GoogleMap 風）。
      startTransition({
        centerX: 0,
        centerZ: 0,
        viewHeight: DEFAULT_VIEW_HEIGHT,
      });
    },
    resetNorth() {
      // 2D は常に北が上・真上ビュー。向きの概念がないので何もしない。
    },
    getHeading() {
      return 0;
    },
    isSettled() {
      return pyramid.settled();
    },
    dispose() {
      gestures.detach();
      pyramid.dispose();
      gl.deleteProgram(program);
      gl.deleteVertexArray(vao);
      if (hud) hud.textContent = "";
    },
  };
}
