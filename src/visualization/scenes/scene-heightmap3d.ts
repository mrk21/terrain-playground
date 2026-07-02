import type { HeightMapFunc } from "../../algorithm/height";
import * as mat4 from "../../core/math/mat4";
import { clamp } from "../../core/math/scalar";
import { createProgram } from "../gl/shader";
import { attachGestures } from "../input/gestures";
import fragSrc from "../shaders/terrain.frag?raw";
import vertSrc from "../shaders/terrain.vert?raw";
import { extractFrustumPlanes } from "./culling";
import type { Scene } from "./scene";
import { eyePosition, groundUnder, raycastSurface } from "./terrain-camera";
import { createTerrainTiles } from "./terrain-tiles";
import {
  BOX_MAX_Y,
  FAR,
  FOV,
  HEIGHT_SCALE,
  MAX_DISTANCE,
  MIN_DISTANCE,
  MOVING_BUILD_BUDGET,
  TARGET_Y,
} from "./terrain3d-config";
import { type CameraPose, viewMovedFast } from "./view-motion";
import {
  type ChannelKind,
  createResetAnimator,
  RESET_ANIM_SECONDS,
} from "./view-transition";

/** 「速く動いている」とみなす 1 フレームの変化しきい値（滑走中はタイル生成を絞る）。 */
const MOTION_THRESHOLDS = { panPx: 12, zoomLog: 0.015, rotRad: 0.015 };

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

  // --- リセットの滑らかな遷移（初期化ボタン・方位磁針クリックで初期状態へ easing） ---
  // 動かすチャンネルと補間の種類（姿勢は CameraPose と同じ 5 軸）。距離は指数的（log）に
  // 動かすとズーム倍率が一定率で変わり、大きな倍率差でも等速に感じる。
  const RESET_CHANNELS: Record<keyof CameraPose, ChannelKind> = {
    yaw: "angle", // 何周していても最短回りで北へ戻す
    pitch: "linear",
    distance: "log",
    tx: "linear",
    tz: "linear",
  };
  const resetAnim = createResetAnimator<keyof CameraPose>(
    RESET_CHANNELS,
    RESET_ANIM_SECONDS,
  );

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

  const gestures = attachGestures(canvas, {
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
    onUserInput() {
      // 手動操作が入ったらリセットの遷移アニメを打ち切り、以降は指の操作に委ねる。
      resetAnim.cancel();
    },
  });

  // 現在のカメラ姿勢（遷移の始点・速い動きの検知の両方で使う）。
  const currentPose = (): CameraPose => ({
    tx: target[0],
    tz: target[2],
    distance,
    yaw,
    pitch,
  });
  const applyPose = (p: CameraPose): void => {
    yaw = p.yaw;
    pitch = p.pitch;
    distance = p.distance;
    target[0] = p.tx;
    target[2] = p.tz;
  };
  // 現在の姿勢から to へ滑らかに遷移させる。滑走中の慣性は止める（遷移後に再開して
  // 家に着いた地図が滑り出すのを防ぐ）。
  const startTransition = (to: CameraPose): void => {
    gestures.cancelInertia();
    resetAnim.start(currentPose(), to);
  };

  const hud = document.querySelector<HTMLElement>("#hud");

  const proj = mat4.create();
  const view = mat4.create();
  const mvp = mat4.create();
  const planes = new Float32Array(24);

  // 前フレームの視点姿勢。速い動き（滑走中）を検知してタイル生成予算を絞るのに使う。
  let prevPose: CameraPose | null = null;

  return {
    render(timeSeconds) {
      // リセットの遷移アニメ中なら姿勢を進める（アニメ中でなければ null で何もしない）。
      const animated = resetAnim.sample(timeSeconds);
      if (animated) applyPose(animated);

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
      // 視点が速く動いている間（慣性の滑走中など）は生成予算を絞り、粗い親で覆ったまま
      // 滑らせてフレームを軽く保つ。止まれば通常予算で細部を焼き直して鮮明化する。
      const pose = currentPose();
      const worldPerPx =
        (2 * distance * Math.tan(FOV / 2)) / canvas.clientHeight;
      const fast =
        prevPose !== null &&
        viewMovedFast(prevPose, pose, worldPerPx, MOTION_THRESHOLDS);
      prevPose = pose;

      const renderList = tiles.collect({ eyeX, eyeY, eyeZ, screenK, planes });
      tiles.maintain(fast ? MOVING_BUILD_BUDGET : undefined);

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
      // カメラからマウス方向へレイを飛ばし、実際の地表面（描画と同じく高さに
      // HEIGHT_SCALE を掛けた面）との交点を求める。平面近似ではないので、斜めから
      // 見てもマウス直下の地点を正しく返す。標高は色付け前の生の高さで表示する。
      // FAR で打ち切り、描画されていない遠方（far クリップの先＝画面上は空）の
      // 地形は拾わない——HUD と実際に見えている絵を一致させる。
      const cam = { yaw, pitch, fov: FOV, target };
      const viewport = { w: canvas.clientWidth, h: canvas.clientHeight };
      const hit = raycastSurface(
        cam,
        viewport,
        [screenX, screenY],
        distance,
        (x, z) => height(x, z) * HEIGHT_SCALE,
        { minY: 0, maxY: BOX_MAX_Y },
        FAR,
      );
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
      // 初期位置・アングル・ズームへ滑らかに戻す（GoogleMap 風）。
      startTransition({
        tx: INIT_TARGET[0],
        tz: INIT_TARGET[2],
        distance: INIT_DISTANCE,
        yaw: INIT_YAW,
        pitch: INIT_PITCH,
      });
    },
    resetNorth() {
      // 位置・ズームは保ち、向きだけ北上・真上へ滑らかに戻す。
      startTransition({ ...currentPose(), yaw: INIT_YAW, pitch: INIT_PITCH });
    },
    getHeading() {
      return yaw;
    },
    isSettled() {
      return settled;
    },
    dispose() {
      gestures.detach();
      tiles.dispose();
      gl.deleteProgram(program);
      if (hud) hud.textContent = "";
    },
  };
}
