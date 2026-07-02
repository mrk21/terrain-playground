/**
 * マウスとタッチを統一して扱うジェスチャ認識器（iOS 版 Google Maps 風）。
 *
 *   - 1 本指ドラッグ / マウスドラッグ → パン（onDrag）。デスクトップは Shift で回転。
 *   - 2 本指ピンチ（指の間隔の変化）→ ズーム（onPinch、焦点付き）。
 *   - 2 本指ツイスト（指の角度の変化）→ 回転（onTwist）。
 *   - 2 本指の上下ドラッグ（重心の縦移動）→ 傾け（onTilt）。
 *   - ダブルタップ＋上下ドラッグ → 1 本指ズーム（下で拡大・上で縮小、onPinch）。
 *   - ダブルタップ（その場で離す）→ 1 段ズームイン。
 *   - 2 本指タップ → 1 段ズームアウト。
 *   - ホイール / トラックパッド → ズーム（onWheelZoom、焦点付き）。
 *
 * パンは 1 本指ドラッグ専用、ズーム・回転・傾けは 2 本指（とダブルタップ）専用に
 * 分けることで、Google Maps と同じく操作が混ざらない。焦点（focal）は canvas 左上を
 * 原点とする CSS ピクセル座標で、ズーム時に指の下の地点が動かないよう合わせるのに使う。
 */
import { wrapAngleDelta } from "../../core/math/scalar";
import { createGestureInertia } from "./gesture-inertia";
import { twoFingerGesture } from "./gesture-math";

export interface GestureTarget {
  /** 1 本指 / マウスのドラッグ。dx,dy は CSS px。shift はデスクトップ回転用。 */
  onDrag?(dx: number, dy: number, shift: boolean): void;
  /** ズーム。scale>1 で拡大。fx,fy は焦点（canvas 相対 CSS px）。ピンチ・1本指ズーム共通。 */
  onPinch?(scale: number, fx: number, fy: number): void;
  /** 2 本指ツイスト。dAngle はラジアン（時計回りが正）。fx,fy は焦点。 */
  onTwist?(dAngle: number, fx: number, fy: number): void;
  /** 2 本指の上下ドラッグ。dy は重心の縦移動 CSS px（下が正）。 */
  onTilt?(dy: number): void;
  /** ホイール / トラックパッドズーム。deltaY と焦点 fx,fy。 */
  onWheelZoom?(deltaY: number, fx: number, fy: number): void;
}

interface Pt {
  x: number;
  y: number;
}

/** ダブルタップ成立とみなす前タップからの最大間隔（ms）。 */
const DOUBLE_TAP_MS = 300;
/** タップ（≒移動なしの短い接触）とみなす最大時間（ms）。 */
const TAP_MAX_MS = 250;
/** タップ判定の移動許容量（CSS px）。指の太さぶん緩める。 */
const TAP_SLOP = 24;
/** 1 本指ズームの感度（px あたりの指数）。下方向 1px で exp(0.01) 倍。 */
const ONE_FINGER_ZOOM_PER_PX = 0.01;
/** ダブルタップ／2 本指タップ 1 回ぶんのズーム倍率。 */
const STEP_ZOOM = 2;

/** canvas にジェスチャを取り付ける。戻り値を呼ぶと取り外す。 */
export function attachGestures(
  canvas: HTMLCanvasElement,
  target: GestureTarget,
): () => void {
  const pointers = new Map<number, Pt>();
  let mode: "none" | "drag" | "pinch" | "zoom" = "none";
  let shift = false;

  // ドラッグ（1 本指）状態。
  const last: Pt = { x: 0, y: 0 };
  // 慣性（指を離すと徐々に減速して止まる）。パン/回転/傾け/ズームを滑らせる。
  const inertia = createGestureInertia(target);
  // ピンチ（2 本指）状態。重心は傾け（縦）にだけ使うので y のみ保持。
  let prevCy = 0;
  let prevDist = 1;
  let prevAngle = 0;

  // タップ／ダブルタップ検出（接触開始の時刻・位置と、その後の移動量）。
  let downTime = 0;
  let downX = 0;
  let downY = 0;
  let moved = 0;
  let lastTapTime = -Infinity;
  let lastTapX = 0;
  let lastTapY = 0;
  // 1 本指ズーム（ダブルタップ＋ドラッグ）の焦点と前回 y。
  let zoomFx = 0;
  let zoomFy = 0;
  let zoomLastY = 0;
  // 2 本指タップ（ズームアウト）検出。
  let pinchStartTime = 0;
  let pinchMoved = 0;
  let pinchCx = 0;
  let pinchCy = 0;
  // 2 本指タップを処理したら、残り指の離しをタップとして記録しないための印。
  let tapConsumed = false;

  const rel = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // 2 本指の重心・間隔・角度を取り出す。
  const twoFinger = (): ReturnType<typeof twoFingerGesture> => {
    const it = pointers.values();
    const a = it.next().value as Pt;
    const b = it.next().value as Pt;
    return twoFingerGesture(a, b);
  };

  const beginDrag = (t: number): void => {
    const p = pointers.values().next().value as Pt;
    last.x = p.x;
    last.y = p.y;
    // パンも Shift+ドラッグ回転も滑らせる（replay 時に shift で振り分ける）。
    inertia.dragBegin(p.x, p.y, t, shift);
    mode = "drag";
  };

  const beginPinch = (t: number): void => {
    const g = twoFinger();
    prevCy = g.cy;
    prevDist = g.dist;
    prevAngle = g.angle;
    pinchStartTime = t;
    pinchMoved = 0;
    pinchCx = g.cx;
    pinchCy = g.cy;
    inertia.pinchBegin(t);
    mode = "pinch";
  };

  const onPointerDown = (e: PointerEvent): void => {
    // 新しい接触は進行中の慣性を止める（滑っている地図を指で押さえる）。
    inertia.cancel();
    const p = rel(e);
    pointers.set(e.pointerId, p);
    canvas.setPointerCapture(e.pointerId);
    shift = e.shiftKey;
    if (pointers.size === 1) {
      const isDoubleTap =
        e.timeStamp - lastTapTime <= DOUBLE_TAP_MS &&
        Math.hypot(p.x - lastTapX, p.y - lastTapY) <= TAP_SLOP;
      downTime = e.timeStamp;
      downX = p.x;
      downY = p.y;
      moved = 0;
      tapConsumed = false;
      if (isDoubleTap) {
        // ダブルタップの 2 回目を押したまま：1 本指ズーム開始。離せば 1 段ズームイン。
        mode = "zoom";
        zoomFx = p.x;
        zoomFy = p.y;
        zoomLastY = p.y;
        lastTapTime = -Infinity; // 消費
        inertia.zoomBegin(e.timeStamp);
      } else {
        beginDrag(e.timeStamp);
      }
    } else if (pointers.size === 2) {
      beginPinch(e.timeStamp);
    }
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent): void => {
    const pt = pointers.get(e.pointerId);
    if (!pt) return;
    const p = rel(e);
    pt.x = p.x;
    pt.y = p.y;

    if (mode === "drag" && pointers.size === 1) {
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      last.x = p.x;
      last.y = p.y;
      moved = Math.max(moved, Math.hypot(p.x - downX, p.y - downY));
      // フリング速度推定用に軌跡を記録する。
      inertia.dragMove(p.x, p.y, e.timeStamp);
      if (dx !== 0 || dy !== 0) target.onDrag?.(dx, dy, shift);
    } else if (mode === "zoom" && pointers.size === 1) {
      const dy = p.y - zoomLastY;
      zoomLastY = p.y;
      moved = Math.max(moved, Math.hypot(p.x - downX, p.y - downY));
      // 下へドラッグ（dy>0）で拡大、上へで縮小。焦点はダブルタップ位置に固定。
      if (dy !== 0) {
        const scale = Math.exp(dy * ONE_FINGER_ZOOM_PER_PX);
        target.onPinch?.(scale, zoomFx, zoomFy);
        inertia.zoomMove(scale, zoomFx, zoomFy, e.timeStamp); // ズーム慣性用に記録
      }
    } else if (mode === "pinch" && pointers.size >= 2) {
      const g = twoFinger();
      pinchMoved +=
        Math.hypot(g.cx - pinchCx, g.cy - pinchCy) +
        Math.abs(g.dist - prevDist);
      const scale = g.dist / prevDist;
      if (g.dist !== prevDist) target.onPinch?.(scale, g.cx, g.cy);
      const da = wrapAngleDelta(g.angle - prevAngle);
      if (da !== 0) target.onTwist?.(da, g.cx, g.cy);
      const dcy = g.cy - prevCy;
      if (dcy !== 0) target.onTilt?.(dcy);
      // ズーム/回転/傾けの慣性用に 1 手ぶんを記録する。
      inertia.pinchMove(scale, da, dcy, g.cx, g.cy, e.timeStamp);
      prevCy = g.cy;
      prevDist = g.dist;
      prevAngle = g.angle;
      pinchCx = g.cx;
      pinchCy = g.cy;
    }
    e.preventDefault();
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (!pointers.has(e.pointerId)) return;
    const prevMode = mode;
    const wasTwo = pointers.size === 2;
    pointers.delete(e.pointerId);
    canvas.releasePointerCapture?.(e.pointerId);

    // 2 本指タップ（ほぼ動かさず素早く離す）→ 1 段ズームアウト。最初の指が離れた瞬間に判定。
    if (prevMode === "pinch" && wasTwo) {
      const quick =
        e.timeStamp - pinchStartTime <= TAP_MAX_MS && pinchMoved <= TAP_SLOP;
      if (quick) {
        target.onPinch?.(1 / STEP_ZOOM, pinchCx, pinchCy);
        tapConsumed = true; // 残りの指の離しはタップ扱いしない
      }
    }

    // すべての指が離れたとき：タップ記録 or ダブルタップの 1 段ズームイン。
    if (pointers.size === 0) {
      const quick = e.timeStamp - downTime <= TAP_MAX_MS && moved <= TAP_SLOP;
      if (prevMode === "zoom") {
        if (quick) target.onPinch?.(STEP_ZOOM, zoomFx, zoomFy); // 動かさず離した＝1 段ズームイン
        lastTapTime = -Infinity;
      } else if (prevMode === "drag" && quick && !tapConsumed) {
        // 1 回目のタップとして記録（次の素早いタップでダブルタップ成立）。
        lastTapTime = e.timeStamp;
        lastTapX = downX;
        lastTapY = downY;
      }
      tapConsumed = false;
    }

    // 指の数が変わったら、残りの指で次のモードを開始（座標を取り直すので飛ばない）。
    if (pointers.size === 1) {
      beginDrag(e.timeStamp);
    } else if (pointers.size >= 2) {
      beginPinch(e.timeStamp);
    } else {
      mode = "none";
      // 最後の指が離れた：慣性で滑らせる（パン/回転/傾け/ズーム。微小速度は inertia 側で無視）。
      inertia.release(e.timeStamp);
    }
    e.preventDefault();
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = rel(e);
    target.onWheelZoom?.(e.deltaY, p.x, p.y);
  };

  // iOS Safari のページ全体ピンチズーム（非標準 gesture* イベント）を抑止。
  const onSafariGesture = (e: Event): void => e.preventDefault();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("gesturestart", onSafariGesture);
  canvas.addEventListener("gesturechange", onSafariGesture);
  canvas.addEventListener("gestureend", onSafariGesture);

  return () => {
    inertia.cancel();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("gesturestart", onSafariGesture);
    canvas.removeEventListener("gesturechange", onSafariGesture);
    canvas.removeEventListener("gestureend", onSafariGesture);
  };
}
