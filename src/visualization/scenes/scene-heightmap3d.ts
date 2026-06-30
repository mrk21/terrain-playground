import type { HeightMapFunc } from "../../algorithm/height";
import * as mat4 from "../../core/math/mat4";
import { clamp } from "../../core/math/scalar";
import { createProgram } from "../gl/shader";
import { attachGestures } from "../input/gestures";
import fragSrc from "../shaders/terrain.frag?raw";
import vertSrc from "../shaders/terrain.vert?raw";
import { extractFrustumPlanes } from "./culling";
import type { Scene } from "./scene";
import { eyePosition, groundUnder } from "./terrain-camera";
import { createTerrainTiles } from "./terrain-tiles";
import {
  FAR,
  FOV,
  MAX_DISTANCE,
  MIN_DISTANCE,
  TARGET_Y,
} from "./terrain3d-config";

/**
 * 地形をクアッドツリー LOD で描く 3D シーン。
 *
 * 役割分担：ノードの生成・選択・キャッシュ（クアッドツリー LOD）は terrain-tiles、
 * メッシュの幾何は node-mesh、カメラ投影の数学は terrain-camera、定数は terrain3d-config。
 * ここはそれらを束ね、カメラ状態とジェスチャ、MVP 行列、描画コールを受け持つ。
 */
export function createSceneHeightmap3D(
  gl: WebGL2RenderingContext,
  heightFunc: HeightMapFunc,
): Scene {
  const tiles = createTerrainTiles(gl, heightFunc);
  // HUD のマウス標高表示用に高さ関数を保持（setHeight で差し替える）。
  let height = heightFunc;

  const program = createProgram(gl, vertSrc, fragSrc);
  const uMvp = gl.getUniformLocation(program, "uMvp");

  // --- カメラ状態（ドラッグでパン・ホイールでズーム・Shift+ドラッグで回転） ---
  // 初期値（リセット用に保持）。yaw=0 で北が上、pitch=PI/2 で真上から見下ろす。
  const INIT_YAW = 0; // 2D と同じ向き（軸そろい）。回転していると斜めに見えるため。
  const INIT_PITCH = Math.PI / 2; // 初期は真上から見下ろす（2D と同じ向き）
  // 真上ビューの見える縦幅 = 2*distance*tan(FOV/2)。これを 2D の表示高さ(200) に合わせる。
  const INIT_DISTANCE = 200 / (2 * Math.tan(FOV / 2));
  const INIT_TARGET: readonly [number, number, number] = [0, TARGET_Y, 0];

  let yaw = INIT_YAW;
  let pitch = INIT_PITCH;
  let distance = INIT_DISTANCE;
  const target: [number, number, number] = [...INIT_TARGET];
  let settled = false;

  const canvas = gl.canvas as HTMLCanvasElement;

  // factor>1 で拡大（distance を縮める）。焦点 (fx,fy) の地点が動かないよう target を補正。
  const zoomAt = (factor: number, fx: number, fy: number): void => {
    const cam = { yaw, pitch, fov: FOV, target };
    const viewport = { w: canvas.clientWidth, h: canvas.clientHeight };
    const before = groundUnder(cam, viewport, [fx, fy], distance);
    distance = clamp(distance / factor, MIN_DISTANCE, MAX_DISTANCE);
    if (!before) return;
    const after = groundUnder(cam, viewport, [fx, fy], distance);
    if (!after) return;
    // groundUnder は [x, z] を返す。target の x,z を補正。
    target[0] += before[0] - after[0];
    target[2] += before[1] - after[1];
  };

  const detachGestures = attachGestures(canvas, {
    onDrag(dx, dy, shift) {
      if (shift) {
        // デスクトップ：Shift+ドラッグで回転。
        yaw -= dx * 0.005;
        pitch = clamp(pitch - dy * 0.005, 0.15, Math.PI / 2);
        return;
      }
      const worldPerPx =
        (2 * distance * Math.tan(FOV / 2)) / canvas.clientHeight;
      const fwdX = Math.sin(yaw);
      const fwdZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = Math.sin(yaw);
      target[0] += (-rightX * dx + fwdX * dy) * worldPerPx;
      target[2] += (-rightZ * dx + fwdZ * dy) * worldPerPx;
    },
    onPinch(scale, fx, fy) {
      zoomAt(scale, fx, fy);
    },
    onTwist(dAngle) {
      // 2 本指のひねりに合わせて地図を回す。
      yaw -= dAngle;
    },
    onTilt(dy) {
      // 2 本指を上へ（dy<0）で地平線方向に倒す＝pitch を小さく。下へ戻すと真上ビュー。
      pitch = clamp(pitch + dy * 0.005, 0.15, Math.PI / 2);
    },
    onWheelZoom(deltaY, fx, fy) {
      zoomAt(Math.exp(-deltaY * 0.001), fx, fy);
    },
  });

  const hud = document.querySelector<HTMLElement>("#hud");

  const proj = mat4.create();
  const view = mat4.create();
  const mvp = mat4.create();
  const planes = new Float32Array(24);

  return {
    render() {
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0.45, 0.62, 0.82, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // カメラ位置と、三角形のピクセル投影サイズを出すスケール係数。
      const [eyeX, eyeY, eyeZ] = eyePosition({ yaw, pitch }, target, distance);
      const screenK = canvas.clientHeight / (2 * Math.tan(FOV / 2));

      const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
      mat4.perspective(FOV, aspect, 0.5, FAR, proj);
      mat4.translation(0, 0, -distance, view);
      mat4.multiply(view, mat4.rotationX(pitch), view);
      mat4.multiply(view, mat4.rotationY(yaw), view);
      mat4.multiply(
        view,
        mat4.translation(-target[0], -target[1], -target[2]),
        view,
      );
      mat4.multiply(proj, view, mvp);
      extractFrustumPlanes(mvp, planes);

      // 描画ノードを集め、不足分の生成と超過分の退避を行う。
      const renderList = tiles.collect({ eyeX, eyeY, eyeZ, screenK, planes });
      tiles.maintain();

      gl.useProgram(program);
      gl.uniformMatrix4fv(uMvp, false, mvp);
      for (const node of renderList) {
        gl.bindVertexArray(node.vao);
        gl.drawElements(gl.TRIANGLES, tiles.indexCount, gl.UNSIGNED_SHORT, 0);
      }
      gl.bindVertexArray(null);

      if (hud)
        hud.textContent = `nodes: ${renderList.length} / cache: ${tiles.size}`;

      settled = tiles.settled();
    },
    worldAt(screenX, screenY) {
      // 画面の点が注視点高さ TARGET_Y の水平面に刺さる (x,z) を出し、その標高を引く。
      // 厳密な地表メッシュへのレイキャストではないので、真上ビューでは正確、
      // 傾けると視差ぶんの誤差が出る（HUD の目安としては十分）。
      const cam = { yaw, pitch, fov: FOV, target };
      const viewport = { w: canvas.clientWidth, h: canvas.clientHeight };
      const hit = groundUnder(cam, viewport, [screenX, screenY], distance);
      if (!hit) return null;
      return { x: hit[0], z: hit[1], height: height(hit[0], hit[1]) };
    },
    worldPerPixel() {
      // 注視点の奥行きでの値（pan の worldPerPx と同じ）。真上ビューで正確、傾けると近似。
      return (2 * distance * Math.tan(FOV / 2)) / canvas.clientHeight;
    },
    setHeight(next) {
      height = next;
      tiles.setHeight(next);
    },
    resetView() {
      yaw = INIT_YAW;
      pitch = INIT_PITCH;
      distance = INIT_DISTANCE;
      target[0] = INIT_TARGET[0];
      target[1] = INIT_TARGET[1];
      target[2] = INIT_TARGET[2];
    },
    resetNorth() {
      // 位置・ズームは保ち、向きだけ北上・真上に戻す。
      yaw = INIT_YAW;
      pitch = INIT_PITCH;
    },
    getHeading() {
      return yaw;
    },
    isSettled() {
      return settled;
    },
    dispose() {
      detachGestures();
      tiles.dispose();
      gl.deleteProgram(program);
      if (hud) hud.textContent = "";
    },
  };
}
