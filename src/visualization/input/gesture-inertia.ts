/**
 * ジェスチャ認識器（gestures.ts）に慣性を足すコーディネータ。滑走の対象は 2 系統:
 *   - ドラッグ（1 本指/マウス）: パン、およびデスクトップの Shift+ドラッグ回転/傾け。
 *     どちらも onDrag(dx, dy, shift) で表せるので、離した shift を覚えて replay する。
 *   - ピンチ（2 本指）: ズーム（倍率）・回転（角度）・傾け（pitch 入力）の 3 軸。
 *     倍率は対数で積むと一定率で滑らかに減衰する。焦点は離した瞬間の重心で固定。
 *
 * gestures.ts からは各イベントで薄く呼ぶだけ（begin/move/release/cancel）。慣性の状態・
 * 蓄積・「離したときパンとピンチのどちらを滑らせるか」の判断はここに閉じ込める。
 */
import type { GestureTarget } from "./gestures";
import { createInertia, type InertiaChannel } from "./inertia";

// --- 軸ごとのチューニング（単位: パン/傾けは CSS px/ms、ズームは log 倍率/ms、回転は rad/ms）---
/** パン（および Shift+ドラッグの回転/傾け）。滑走の長さ・発動しきい値。 */
const PAN: InertiaChannel = {
  tauMs: 325,
  minSpeed: 0.05,
  stopSpeed: 0.02,
  maxSpeed: 6,
};
/** ピンチズーム（log 倍率/ms）。倍率は乗算的なので log 空間で減衰させる。 */
const ZOOM: InertiaChannel = {
  tauMs: 260,
  minSpeed: 0.0006,
  stopSpeed: 0.00025,
  maxSpeed: 0.02,
};
/** 2 本指ツイスト回転（rad/ms）。 */
const ROTATE: InertiaChannel = {
  tauMs: 300,
  minSpeed: 0.0015,
  stopSpeed: 0.0006,
  maxSpeed: 0.02,
};
/** 2 本指の上下ドラッグによる傾け（CSS px/ms、重心の縦移動）。 */
const TILT: InertiaChannel = {
  tauMs: 300,
  minSpeed: 0.04,
  stopSpeed: 0.02,
  maxSpeed: 4,
};
/**
 * ピンチ直後の 1 本指ドラッグが「離しのドリフト」ではなく「意図したパン」とみなす
 * 速度しきい値（CSS px/ms）。ピンチを離すとき 2 本指は同時に離れず、残った指が
 * わずかにドリフトする（~0.1px/ms）。これを超えるフリック級のときだけパンを優先し、
 * それ以下ならピンチ（ズーム/回転/傾け）を滑らせる。
 */
const POST_PINCH_PAN_SPEED = 0.4;

export interface GestureInertia {
  /** ドラッグ開始（shift=true はデスクトップ回転/傾け）。 */
  dragBegin(x: number, y: number, t: number, shift: boolean): void;
  /** ドラッグ中の位置（canvas 相対 CSS px）。 */
  dragMove(x: number, y: number, t: number): void;
  /** ピンチ開始。 */
  pinchBegin(t: number): void;
  /** ピンチ中の 1 手ぶん：倍率比 scale・回転 dAngle(rad)・傾け dTilt(px)・焦点(fx,fy)。 */
  pinchMove(
    scale: number,
    dAngle: number,
    dTilt: number,
    fx: number,
    fy: number,
    t: number,
  ): void;
  /** ダブルタップ後の 1 本指ズーム開始（ズーム軸だけを使う。焦点は固定）。 */
  zoomBegin(t: number): void;
  /** 1 本指ズーム中の 1 手ぶん：倍率比 scale・焦点(fx,fy)。 */
  zoomMove(scale: number, fx: number, fy: number, t: number): void;
  /** 最後の指が離れた：パン/ピンチ/1 本指ズームのうち速度のあるものを滑らせる。 */
  release(t: number): void;
  /** すべての滑走・記録を破棄する。 */
  cancel(): void;
}

export function createGestureInertia(target: GestureTarget): GestureInertia {
  // ドラッグ滑走。離したときの shift を覚えて onDrag に渡す（パン／回転を切り替える）。
  let dragShift = false;
  const drag = createInertia([PAN, PAN], (d) =>
    target.onDrag?.(d[0], d[1], dragShift),
  );

  // ピンチ滑走。焦点と、積算した log 倍率・角度・傾けを保持。
  let fx = 0;
  let fy = 0;
  let zoomAcc = 0;
  let angleAcc = 0;
  let tiltAcc = 0;
  const pinch = createInertia([ZOOM, ROTATE, TILT], (d) => {
    if (d[0] !== 0) target.onPinch?.(Math.exp(d[0]), fx, fy);
    if (d[1] !== 0) target.onTwist?.(d[1], fx, fy);
    if (d[2] !== 0) target.onTilt?.(d[2]);
  });
  // ピンチ→1 本指の遷移でピンチ速度を退避しておく（ドリフトで窓から外れる前に確保）。
  let pinchStash: number[] | null = null;

  return {
    dragBegin(x, y, t, shift) {
      // 直前がピンチなら、まだ新鮮なうちにピンチ速度を退避してからドラッグを始める。
      // （残り指のドリフト数フレームを挟むと速度窓から外れて 0 になってしまうため）
      const pv = pinch.peekVelocity(t);
      pinchStash = pv.some((v) => v !== 0) ? pv : null;
      pinch.cancel();
      dragShift = shift;
      drag.begin([x, y], t);
    },
    dragMove(x, y, t) {
      drag.move([x, y], t);
    },
    pinchBegin(t) {
      zoomAcc = 0;
      angleAcc = 0;
      tiltAcc = 0;
      pinch.begin([0, 0, 0], t);
    },
    pinchMove(scale, dAngle, dTilt, focusX, focusY, t) {
      zoomAcc += Math.log(scale);
      angleAcc += dAngle;
      tiltAcc += dTilt;
      fx = focusX;
      fy = focusY;
      pinch.move([zoomAcc, angleAcc, tiltAcc], t);
    },
    zoomBegin(t) {
      // 1 本指ズームはズーム軸だけを動かす（回転・傾けは 0 のまま）。
      zoomAcc = 0;
      angleAcc = 0;
      tiltAcc = 0;
      pinch.begin([0, 0, 0], t);
    },
    zoomMove(scale, focusX, focusY, t) {
      zoomAcc += Math.log(scale);
      fx = focusX;
      fy = focusY;
      pinch.move([zoomAcc, angleAcc, tiltAcc], t);
    },
    release(t) {
      const stashed = pinchStash;
      pinchStash = null;
      if (stashed) {
        // 直前が 2 本指ピンチ。残り指のドラッグが明確なパンフリックならパンを、そうでなければ
        // （離しのドリフト）退避したピンチ速度でズーム/回転/傾けを滑らせる。
        const dv = drag.peekVelocity(t);
        if (Math.hypot(dv[0], dv[1]) > POST_PINCH_PAN_SPEED) drag.end(t);
        else pinch.glide(stashed, t);
        return;
      }
      // ピンチ由来（1 本指ズーム含む）に速度があればそれを、無ければパンを滑らせる。
      // 純パンでは pinch のサンプルが空なので pinch.end は false を返し、drag に落ちる。
      if (!pinch.end(t)) drag.end(t);
    },
    cancel() {
      pinchStash = null;
      drag.cancel();
      pinch.cancel();
    },
  };
}
