/**
 * カメラを初期位置・北向きへ「滑らかに」戻すためのトゥイーン（環境非依存の純粋計算）。
 *
 * ボタンを押した瞬間にワープさせるのではなく、GoogleMap のように短時間 easing して
 * 遷移させる。各チャンネル（yaw / pitch / distance / 中心座標 / ズーム…）は単位も
 * 補間すべき性質も違うので、「線形・角度（最短回り）・対数（指数的ズーム）」の 3 種類
 * から選ぶ。時刻や rAF はここに持ち込まず、進捗 progress∈[0,1] を受け取って値を返す
 * だけなので、ここだけで TDD できる（時間軸・render ループへの配線は scene 側）。
 */

import { clamp } from "../../core/math/scalar";

/** 各チャンネルの補間の種類。 */
export type ChannelKind = "linear" | "angle" | "log";

/** リセットアニメの長さ（秒）。GoogleMap のリセットに近い体感。 */
export const RESET_ANIM_SECONDS = 0.45;

/**
 * ease-in-out（3 次）。t∈[0,1] を、両端で速度 0・中央付近で最速の S 字に写す。
 * 開始と終了がスッと収まる GoogleMap 風の動き。
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * from→to の最短回りの符号付き角度差（ラジアン）。|差| が π を超えても、また yaw が
 * 何周も回って大きな値になっていても、常に (-π, π] の最短側に折り返して返す
 * （wrapAngleDelta は 1 段補正で |d|<2π 専用。こちらは剰余で任意の範囲を扱う）。
 */
export function shortestAngleDelta(from: number, to: number): number {
  const twoPi = 2 * Math.PI;
  let d = (to - from) % twoPi;
  if (d > Math.PI) d -= twoPi;
  else if (d < -Math.PI) d += twoPi;
  return d;
}

/** 1 チャンネルを種類に応じて from→to へ補間する（t は easing 済みの割合）。 */
function interpolate(
  kind: ChannelKind,
  from: number,
  to: number,
  t: number,
): number {
  switch (kind) {
    case "angle":
      return from + shortestAngleDelta(from, to) * t;
    case "log":
      // 指数的に補間＝ズーム倍率を一定率で変える（体感的に等速のズーム。from,to>0 前提）。
      return from * (to / from) ** t;
    default:
      return from + (to - from) * t;
  }
}

/**
 * 生の進捗 progress における各チャンネルの補間値を返す。progress は内部で [0,1] に
 * 丸めて easing するので、範囲外を渡しても飛ばない（≤0 で from、≥1 で to）。
 * from/to/channels は同じキー集合を持つ想定。
 */
export function sampleTransition<K extends string>(
  from: Record<K, number>,
  to: Record<K, number>,
  channels: Record<K, ChannelKind>,
  progress: number,
): Record<K, number> {
  const t = easeInOutCubic(clamp(progress, 0, 1));
  const out = {} as Record<K, number>;
  for (const key of Object.keys(channels) as K[]) {
    out[key] = interpolate(channels[key], from[key], to[key], t);
  }
  return out;
}

/**
 * 進行中のリセット遷移を時間軸に沿って駆動する小さなステートマシン。
 * 姿勢は「動かすチャンネル名 K の集合 → 数値」の Record で表す（K を interface の
 * keyof にすれば既存の姿勢型をそのまま渡せる）。
 */
export interface ResetAnimator<K extends string> {
  /** 姿勢 from から to へ durationSeconds かけて遷移を開始する。 */
  start(from: Record<K, number>, to: Record<K, number>): void;
  /** アニメーション中か。 */
  active(): boolean;
  /**
   * 時刻 now（秒。単調増加なら原点は任意）の姿勢を返す。アニメ中でなければ null。
   * 最初の sample の now を開始時刻に採る。進捗が 1 に達したフレームで to を返しつつ
   * 自動的に解除し、以降は null を返す。
   */
  sample(now: number): Record<K, number> | null;
  /** アニメーションを中断する（手動操作が割り込んだときなど）。 */
  cancel(): void;
}

/**
 * リセット遷移のドライバを作る。時刻は sample(now) で外から渡すので rAF や
 * performance.now に依存せず決定的にテストできる。2D/3D どちらの scene も、動かす
 * チャンネル K を変えてこれ 1 つで滑らかな遷移を駆動する。
 */
export function createResetAnimator<K extends string>(
  channels: Record<K, ChannelKind>,
  durationSeconds: number,
): ResetAnimator<K> {
  let from: Record<K, number> | null = null;
  let to: Record<K, number> | null = null;
  let startTime: number | null = null;
  let running = false;

  return {
    start(f, t) {
      from = f;
      to = t;
      startTime = null; // 次の sample の now を開始時刻にする。
      running = true;
    },
    active() {
      return running;
    },
    sample(now) {
      if (!running || !from || !to) return null;
      if (startTime === null) startTime = now;
      const progress = (now - startTime) / durationSeconds;
      const pose = sampleTransition(from, to, channels, progress);
      if (progress >= 1) running = false;
      return pose;
    },
    cancel() {
      running = false;
      from = null;
      to = null;
    },
  };
}
