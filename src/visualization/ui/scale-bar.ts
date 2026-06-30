/**
 * Google Maps 風のスケールバー（縮尺）。画面上のバー長が表すワールド距離を「1/2/5×10^n」の
 * きりのよい値で示す。レベル選択は純粋関数（niceScaleBar / formatScaleLabel）に切り出して
 * TDD し、DOM への反映だけ initScaleBar が受け持つ。
 */

/** バーの最大ピクセル長（CSS px）。この幅に収まる最大のきりのよいワールド長を選ぶ。 */
const MAX_BAR_PX = 100;
/** 操作説明と縮尺バーの間にあける最小すき間（CSS px）。 */
const GAP_PX = 12;

/** スケールバーの目盛り（ワールド長と、その画面ピクセル長）。 */
export interface ScaleTick {
  /** バーが表すワールド長（1/2/5 × 10^n）。 */
  worldLength: number;
  /** その worldLength を描くバーの長さ（CSS px、maxBarPx 以下）。 */
  pixelLength: number;
}

/**
 * maxBarPx 以内に収まる最大の「1/2/5 × 10^n」をワールド長として選ぶ（Google Maps 風）。
 * worldPerPx: ワールド長 / CSS ピクセル。深いズーム（worldPerPx<1）では小数も選ぶ。
 */
export function niceScaleBar(worldPerPx: number, maxBarPx: number): ScaleTick {
  const maxWorld = worldPerPx * maxBarPx; // バーに収まる最大ワールド長
  const pow = 10 ** Math.floor(Math.log10(maxWorld)); // 同じ桁の 10^n
  let worldLength = pow;
  for (const mantissa of [5, 2, 1]) {
    if (mantissa * pow <= maxWorld) {
      worldLength = mantissa * pow;
      break;
    }
  }
  return { worldLength, pixelLength: worldLength / worldPerPx };
}

/** ワールド長を表示用に整形する。1 以上は整数、未満は浮動小数の雑音を除いた小数。 */
export function formatScaleLabel(worldLength: number): string {
  if (worldLength >= 1) return String(Math.round(worldLength));
  return String(Number.parseFloat(worldLength.toFixed(6)));
}

/**
 * 副目盛りの分割数。先頭桁が 2 のときは 4 分割、1/5 のときは 5 分割。
 * こうすると副目盛りが常にきりのよい値に落ちる（20→5刻み, 50→10刻み, 10→2刻み）。
 */
export function minorDivisions(worldLength: number): number {
  // 1e-9 は 10 の整数乗での log10 の端数（例: log10(1000)=2.9999…）を吸収する。
  const pow = 10 ** Math.floor(Math.log10(worldLength) + 1e-9);
  const mantissa = Math.round(worldLength / pow); // 1 / 2 / 5
  return mantissa === 2 ? 4 : 5;
}

/**
 * 右下隅に浮かせた縮尺バーの bottom オフセット（CSS px）を返す。
 * 左端の操作説明（hint）と最下段で 1 行に収まれば 0（最下段のまま）。
 * 収まらない（hintWidth + gap + scaleWidth が行幅を超える）なら hintHeight + gap だけ
 * 持ち上げて操作説明の上へ逃がす（バーはフロー外なので他の HUD は動かない）。
 */
export function scaleBottomOffset(
  hintWidth: number,
  hintHeight: number,
  scaleWidth: number,
  rowWidth: number,
  gap: number,
): number {
  const overlaps = hintWidth + gap + scaleWidth > rowWidth;
  return overlaps ? hintHeight + gap : 0;
}

/** #scale 要素を取得し、worldPerPx からバー幅・ラベル・副目盛り・縦位置を更新する関数を返す。 */
export function initScaleBar(): { update(worldPerPx: number): void } {
  const root = document.querySelector<HTMLElement>("#scale");
  const bar = document.querySelector<HTMLElement>("#scale-bar");
  const label = document.querySelector<HTMLElement>("#scale-label");
  const hint = document.querySelector<HTMLElement>("#hint");
  let shownDivisions = 0; // 副目盛りを作り直す必要があるか判定する前回値。
  return {
    update(worldPerPx) {
      // レイアウト前（clientHeight=0）などで不正値になることがあるので弾く。
      if (!(root && bar && label) || !(worldPerPx > 0)) return;
      const { worldLength, pixelLength } = niceScaleBar(worldPerPx, MAX_BAR_PX);
      bar.style.width = `${pixelLength.toFixed(1)}px`;
      label.textContent = formatScaleLabel(worldLength);
      const divisions = minorDivisions(worldLength);
      // 目盛りは % 位置なので幅追従する。本数が変わったときだけ作り直す。
      if (divisions !== shownDivisions) {
        renderTicks(bar, divisions);
        shownDivisions = divisions;
      }
      reposition(root, hint);
    },
  };
}

/** バー内の分割点（i/divisions）に副目盛りの子要素を並べ直す。 */
function renderTicks(bar: HTMLElement, divisions: number): void {
  const ticks: HTMLElement[] = [];
  for (let i = 1; i < divisions; i++) {
    const tick = document.createElement("div");
    tick.className = "scale-tick";
    tick.style.left = `${(i / divisions) * 100}%`;
    ticks.push(tick);
  }
  bar.replaceChildren(...ticks);
}

/** 操作説明(#hint)と重なるなら縮尺バーを 1 行ぶん持ち上げる（収まるなら最下段に戻す）。 */
function reposition(root: HTMLElement, hint: HTMLElement | null): void {
  const row = root.parentElement; // #bottom
  if (!(hint && row)) return;
  const offset = scaleBottomOffset(
    hint.offsetWidth,
    hint.offsetHeight,
    root.offsetWidth,
    row.clientWidth,
    GAP_PX,
  );
  const bottom = `${offset}px`;
  if (root.style.bottom !== bottom) root.style.bottom = bottom;
}
