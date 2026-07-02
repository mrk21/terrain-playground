import type { HeightMapFunc } from "../../algorithm/height";
import { createProgram } from "../gl/shader";
import { attachGestures } from "../input/gestures";
import fragSrc from "../shaders/tile.frag?raw";
import vertSrc from "../shaders/tile.vert?raw";
import type { Scene } from "./scene";
import {
  rotateViewAround,
  screenOffsetToWorld,
  screenToWorld,
  zoomAtFocus,
} from "./tile-lod";
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
/** 初期の向き（0 = 北が上・真上ビュー）。 */
const DEFAULT_HEADING = 0;
/** デスクトップの Shift+ドラッグ回転の感度（rad/px）。3D の yaw と同じ。 */
const ROTATE_PER_PX = 0.005;

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
  const uViewRight = gl.getUniformLocation(program, "uViewRight");
  const uMap = gl.getUniformLocation(program, "uMap");

  // --- ビュー状態（1本指/ドラッグでパン・ピンチ/ホイールでズーム・ツイスト/Shift で回転） ---
  let centerX = 0;
  let centerZ = 0;
  let viewHeight = DEFAULT_VIEW_HEIGHT;
  // 地図の回転角（ラジアン。0 = 北が上）。3D の yaw と同じ向き。
  let heading = DEFAULT_HEADING;

  // --- リセットの滑らかな遷移（初期化ボタン・方位磁針クリックで初期状態へ easing。GoogleMap 風） ---
  // ズーム（viewHeight）は指数的（log）に動かすと倍率が一定率で変わり、大きな倍率差でも
  // 等速に感じる。中心はパンなので線形。向き（heading）は最短回りの角度補間。
  type View = {
    centerX: number;
    centerZ: number;
    viewHeight: number;
    heading: number;
  };
  const RESET_CHANNELS: Record<keyof View, ChannelKind> = {
    centerX: "linear",
    centerZ: "linear",
    viewHeight: "log",
    heading: "angle",
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
      { centerX, centerZ, viewHeight, heading },
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

  // 焦点 (fx,fy) の地点を固定したまま向きを dHeading 回す（2 本指ツイスト用）。
  const rotateAt = (dHeading: number, fx: number, fy: number): void => {
    const next = rotateViewAround(
      { centerX, centerZ, viewHeight, heading },
      dHeading,
      fx,
      fy,
      canvas.clientWidth,
      canvas.clientHeight,
    );
    centerX = next.centerX;
    centerZ = next.centerZ;
    heading = next.heading ?? heading;
  };

  const gestures = attachGestures(canvas, {
    onDrag(dx, dy, shift) {
      if (shift) {
        // デスクトップ：Shift+ドラッグで回転（画面中心を軸に、横移動で向きを変える）。
        heading -= dx * ROTATE_PER_PX;
        return;
      }
      // 中身が指に追従するよう中心を逆に動かす。回転していれば画面の右/下方向が
      // 傾くので、その基底に沿って動かす（水平・垂直で同じスケール）。
      const worldPerPx = viewHeight / canvas.clientHeight;
      const { dx: wdx, dz: wdz } = screenOffsetToWorld(dx, dy, heading);
      centerX -= wdx * worldPerPx;
      centerZ -= wdz * worldPerPx;
    },
    onPinch(scale, fx, fy) {
      zoomAt(scale, fx, fy);
    },
    onTwist(dAngle, fx, fy) {
      // 2 本指のひねりに合わせて地図を回す（指の下の地点は固定。3D の yaw と同じ向き）。
      rotateAt(-dAngle, fx, fy);
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
    resetAnim.start({ centerX, centerZ, viewHeight, heading }, to);
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
        heading = animated.heading;
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
        heading,
      });
      const halfY = viewHeight / 2;
      const halfX = halfY * aspect;

      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(uViewCenter, centerX, centerZ);
      gl.uniform2f(uHalfSpan, halfX, halfY);
      // 画面右方向のワールド単位ベクトル (cosθ, sinθ)。シェーダが画面基底に射影する。
      gl.uniform2f(uViewRight, Math.cos(heading), Math.sin(heading));
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
        { centerX, centerZ, viewHeight, heading },
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
      // 初期位置・初期ズーム・北上へ滑らかに戻す（GoogleMap 風）。
      startTransition({
        centerX: 0,
        centerZ: 0,
        viewHeight: DEFAULT_VIEW_HEIGHT,
        heading: DEFAULT_HEADING,
      });
    },
    resetNorth() {
      // 位置・ズームは保ち、向きだけ北上へ滑らかに戻す（方位磁針クリック用）。
      startTransition({
        centerX,
        centerZ,
        viewHeight,
        heading: DEFAULT_HEADING,
      });
    },
    getHeading() {
      return heading;
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
