/** ジェスチャ認識の環境非依存な幾何計算（canvas 相対 CSS px の素の点を扱う）。 */

/** canvas 左上を原点とする CSS ピクセル座標の点。 */
export interface Point {
  x: number;
  y: number;
}

/** 2 本指の状態。 */
export interface TwoFingerGesture {
  /** 重心 x。 */
  cx: number;
  /** 重心 y。 */
  cy: number;
  /** 指の間隔。0（2 点一致）のときは 0 除算回避のため 1 に丸める。 */
  dist: number;
  /** a→b 方向の角度（ラジアン、時計回りが正）。 */
  angle: number;
}

/** 2 点から重心・間隔・角度を取り出す。 */
export function twoFingerGesture(a: Point, b: Point): TwoFingerGesture {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    dist: Math.hypot(dx, dy) || 1,
    angle: Math.atan2(dy, dx),
  };
}

/**
 * スカラー量の時系列サンプル（値と時刻 ms）。慣性（フリック）の速度推定に使う。
 * パンなら座標 1 軸、ズームなら log(倍率)、回転なら角度、傾けなら pitch 入力など、
 * 「離したあと惰性で続けたい量」を 1 次元で表す。
 */
export interface Sample1D {
  /** 量の値（軸ごとに解釈は呼び出し側が決める）。 */
  v: number;
  /** 時刻（ms、performance.now / event.timeStamp と同じ時間軸）。 */
  t: number;
}

/**
 * 直近サンプルからフリング（指を離した瞬間）の速度を推定する。
 * 最後のサンプルの時刻から `windowMs` 以内のサンプルだけを見て、その最古と
 * 最新の 2 点の平均速度（値/ms）を返す。ウィンドウ末尾に「離した瞬間」の
 * サンプルを入れておけば、動かしてから静止して離したときは移動サンプルが
 * ウィンドウから外れて速度 0 になる（Google Maps と同じく静止後はフリングしない）。
 * ウィンドウ内が 1 点以下、または経過時間 0 のときは 0（0 除算回避）。
 */
export function sampleVelocity(
  samples: readonly Sample1D[],
  windowMs: number,
): number {
  if (samples.length < 2) return 0;
  const end = samples[samples.length - 1];
  const cutoff = end.t - windowMs;
  let start = end;
  for (let i = samples.length - 2; i >= 0; i--) {
    if (samples[i].t < cutoff) break;
    start = samples[i];
  }
  const dt = end.t - start.t;
  if (dt <= 0) return 0;
  return (end.v - start.v) / dt;
}

/** 慣性の 1 ステップ：このフレームの変位 d と減衰後の速度 v。 */
export interface DecayStep {
  d: number;
  v: number;
}

/**
 * 指数減衰する慣性速度を dtMs だけ進める。速度は時定数 tauMs で
 * v *= exp(-dt/tau) と減衰し、このステップの変位は速度の積分
 * v * tau * (1 - exp(-dt/tau))。無限フレーム積算すると総変位は v0*tau に
 * 収束するので、フレームレートに依らず滑走距離が一定になる。
 */
export function decayStep(v: number, dtMs: number, tauMs: number): DecayStep {
  // 時刻の巻き戻り（rAF now と event.timeStamp のずれ）で dt が負になっても
  // 逆走・速度増幅しないよう 0 で下限を切る。
  const decay = Math.exp(-Math.max(dtMs, 0) / tauMs);
  return { d: v * tauMs * (1 - decay), v: v * decay };
}
