/**
 * 汎用の慣性（フリック）。指を離したあと、離した瞬間の速度で値を滑らせ、
 * 指数減衰で徐々に止める（Google Maps 風）。複数チャンネル（軸）を同時に扱えるので、
 * パン（x, y の 2 軸）でもピンチ（ズーム=log 倍率・回転=角度・傾け=pitch 入力の 3 軸）でも
 * 同じ仕組みで滑らせられる。各軸は単位が違いうるので、閾値・時定数は軸ごとに設定する。
 *
 * 速度推定と減衰の数式は gesture-math の純粋関数（sampleVelocity / decayStep）に分離して
 * テストしてある。ここはそれらを時間軸・rAF に配線し、複数軸を束ねるだけのグルー。
 */
import { decayStep, type Sample1D, sampleVelocity } from "./gesture-math";

/** 離した瞬間の速度を推定する時間窓（ms）。直前の静止はこの窓の外なのでフリングしない。 */
const VELOCITY_WINDOW_MS = 80;
/** 慣性 1 フレームの dt 上限（ms）。タブ復帰などの巨大 dt で飛ばないよう抑える。 */
const MAX_INERTIA_DT_MS = 64;
/** 軌跡サンプルの保持上限（速度窓に足りる末尾数点あればよい）。 */
const MAX_SAMPLES = 16;

/** 1 軸ぶんの慣性チューニング（単位は軸ごと：パンは CSS px/ms、回転は rad/ms など）。 */
export interface InertiaChannel {
  /** 減衰時定数（ms）。大きいほど長く滑る（総滑走量 = 速度×tau）。 */
  tauMs: number;
  /** これ未満の速度で離しても、この軸は滑らせない（誤爆・微小移動を無視）。 */
  minSpeed: number;
  /** 滑走中この速度を下回ったら、この軸は停止。 */
  stopSpeed: number;
  /** 速度の上限（素早すぎる操作で飛びすぎるのを防ぐ）。 */
  maxSpeed: number;
}

export interface Inertia {
  /** ジェスチャ開始。各軸の現在値（絶対値）を渡す。 */
  begin(values: readonly number[], t: number): void;
  /** ジェスチャ中の各軸の現在値（絶対値）を記録する。 */
  move(values: readonly number[], t: number): void;
  /**
   * いまのサンプル＋離した瞬間（時刻 t）から各軸の速度を推定して返す（副作用なし）。
   * しきい値未満は 0・上限超えは頭打ち済み。滑走を別タイミングで開始したいとき
   * （ピンチ→1 本指の遷移で速度を退避しておく等）に使う。
   */
  peekVelocity(t: number): number[];
  /** 与えた速度で滑走を開始する。1 軸でも動けば true。 */
  glide(velocities: readonly number[], t: number): boolean;
  /** 指を離した：軌跡から速度を推定して滑走を開始する。1 軸でも滑走したら true。 */
  end(t: number): boolean;
  /** 進行中の滑走・記録を破棄する。 */
  cancel(): void;
}

interface Frame {
  t: number;
  values: number[];
}

/**
 * 慣性を生成する。onStep(deltas) は滑走の各フレームで呼ばれ、各軸のこのフレームの
 * 増分（begin/move で渡した絶対値と同じ単位）を受け取る。呼ぶ側で実際の反映に橋渡しする。
 */
export function createInertia(
  channels: readonly InertiaChannel[],
  onStep: (deltas: number[]) => void,
): Inertia {
  const dims = channels.length;
  let samples: Frame[] = [];
  const vel = new Array<number>(dims).fill(0);
  let raf = 0;
  let lastTime = 0;

  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    vel.fill(0);
  };

  const anyMoving = (): boolean =>
    channels.some((c, i) => Math.abs(vel[i]) >= c.stopSpeed);

  // 毎フレーム、各軸を減衰させた速度ぶんだけ進める。
  const step = (now: number): void => {
    const dt = Math.min(now - lastTime, MAX_INERTIA_DT_MS);
    lastTime = now;
    const deltas: number[] = [];
    let moved = false;
    for (let i = 0; i < dims; i++) {
      const s = decayStep(vel[i], dt, channels[i].tauMs);
      vel[i] = s.v;
      deltas.push(s.d);
      if (s.d !== 0) moved = true;
    }
    if (moved) onStep(deltas);
    if (!anyMoving()) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(step);
  };

  // ある軸の速度を frames から推定し、閾値未満は 0・上限超えは頭打ちにする。
  const channelVelocity = (i: number, frames: readonly Frame[]): number => {
    const axis: Sample1D[] = frames.map((s) => ({ v: s.values[i], t: s.t }));
    const v = sampleVelocity(axis, VELOCITY_WINDOW_MS);
    const speed = Math.abs(v);
    const c = channels[i];
    if (speed < c.minSpeed) return 0;
    if (speed > c.maxSpeed) return (v / speed) * c.maxSpeed;
    return v;
  };

  const peekVelocity = (t: number): number[] => {
    if (samples.length === 0) return channels.map(() => 0);
    // 離した瞬間（最後の値・離した時刻）を仮に足して速度を推定する（非破壊）。
    // 直前に静止していれば移動サンプルが速度窓から外れ、フリングしない。
    const last = samples[samples.length - 1];
    const frames = [...samples, { t, values: last.values }];
    return channels.map((_, i) => channelVelocity(i, frames));
  };

  const glide = (velocities: readonly number[], t: number): boolean => {
    stop(); // 前の滑走を止めてから開始（速度も一旦 0 に）。
    let start = false;
    for (let i = 0; i < dims; i++) {
      vel[i] = velocities[i] ?? 0;
      if (vel[i] !== 0) start = true;
    }
    if (!start) return false;
    lastTime = t;
    raf = requestAnimationFrame(step);
    return true;
  };

  return {
    begin(values, t) {
      stop(); // 前の滑走を止めてから新しいジェスチャを始める。
      samples = [{ t, values: [...values] }];
    },
    move(values, t) {
      samples.push({ t, values: [...values] });
      if (samples.length > MAX_SAMPLES) samples.shift();
    },
    peekVelocity,
    glide,
    end(t) {
      const v = peekVelocity(t);
      samples = [];
      return glide(v, t);
    },
    cancel() {
      samples = [];
      stop();
    },
  };
}
