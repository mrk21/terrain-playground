/**
 * カメラ操作の補助 UI（画面右）。
 *   - 方位磁針：現在の方位を針で示す。クリックで北上・真上に戻す（GoogleMap 風）。
 *   - 初期化ボタン：初期位置・初期アングル・初期ズームに戻す。
 * 実際のカメラ操作はコールバックで main 経由でシーンに委ねる。
 */

import { throwOnNullable } from "../../core/assert";

export interface CameraControlsOptions {
  /** 初期化ボタン：初期位置・アングルに戻す。 */
  onResetView(): void;
  /** 方位磁針クリック：北上・真上に戻す。 */
  onResetNorth(): void;
}

export interface CameraControlsHandle {
  /** 毎フレーム呼んで方位磁針の針を現在の方位角（ラジアン）に向ける。 */
  setHeading(yawRadians: number): void;
}

export function initCameraControls(
  opts: CameraControlsOptions,
): CameraControlsHandle {
  const root = throwOnNullable(
    document.querySelector("#camera"),
    "#camera が見つかりません。",
  );

  // 方位磁針（クリックで北上・真上）。赤い針が北を指す。
  const compass = document.createElement("button");
  compass.className = "cam-btn compass";
  compass.title = "北を上に・真上から";
  compass.innerHTML = `
    <svg class="compass-needle" viewBox="-12 -12 24 24" aria-hidden="true">
      <polygon points="0,-9 3,0 -3,0" fill="#e5484d" />
      <polygon points="0,9 3,0 -3,0" fill="#aab0c0" />
    </svg>`;
  compass.addEventListener("click", () => opts.onResetNorth());

  // 初期位置・アングルに戻すボタン（クロスヘア）。
  const recenter = document.createElement("button");
  recenter.className = "cam-btn recenter";
  recenter.title = "初期位置・アングルに戻す";
  recenter.innerHTML = `
    <svg viewBox="-12 -12 24 24" fill="none" stroke="#e8e8ef"
         stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <circle cx="0" cy="0" r="4.5" />
      <line x1="0" y1="-11" x2="0" y2="-7" />
      <line x1="0" y1="7" x2="0" y2="11" />
      <line x1="-11" y1="0" x2="-7" y2="0" />
      <line x1="7" y1="0" x2="11" y2="0" />
    </svg>`;
  recenter.addEventListener("click", () => opts.onResetView());

  root.appendChild(compass);
  root.appendChild(recenter);

  const needle = throwOnNullable(
    compass.querySelector<SVGElement>(".compass-needle"),
    ".compass-needle が見つかりません。",
  );
  let last = Number.NaN;

  return {
    setHeading(yaw) {
      if (yaw === last) return; // 変化がなければ DOM を触らない。
      last = yaw;
      // 画面上で北(-z)が指す向きに針を回す（CSS rotate は時計回りが正なので -yaw）。
      needle.style.transform = `rotate(${-yaw}rad)`;
    },
  };
}
