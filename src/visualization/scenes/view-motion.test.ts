import { describe, expect, it } from "vitest";
import { type CameraPose, viewMovedFast } from "./view-motion";

const TH = { panPx: 12, zoomLog: 0.015, rotRad: 0.015 };
const base: CameraPose = { tx: 0, tz: 0, distance: 200, yaw: 0, pitch: 1.5 };

describe("viewMovedFast", () => {
  it("静止（前フレームと同じ）なら false", () => {
    expect(viewMovedFast(base, base, 0.25, TH)).toBe(false);
  });

  it("速いパン（画面移動が閾値超え）なら true", () => {
    // worldPerPixel=0.25 で 20px/frame 相当のパン（5 ワールド）→ 20>12。
    const cur = { ...base, tx: 5 };
    expect(viewMovedFast(base, cur, 0.25, TH)).toBe(true);
  });

  it("遅いパン（閾値未満）なら false", () => {
    // 2px/frame 相当（0.5 ワールド）→ 2<12。
    const cur = { ...base, tx: 0.5 };
    expect(viewMovedFast(base, cur, 0.25, TH)).toBe(false);
  });

  it("速いズーム（距離の対数変化が閾値超え）なら true", () => {
    const cur = { ...base, distance: 200 * Math.exp(0.05) }; // Δln=0.05>0.015
    expect(viewMovedFast(base, cur, 0.25, TH)).toBe(true);
  });

  it("速い回転（yaw+pitch 変化が閾値超え）なら true", () => {
    const cur = { ...base, yaw: 0.03 }; // 0.03>0.015
    expect(viewMovedFast(base, cur, 0.25, TH)).toBe(true);
  });

  it("わずかな変化（全軸が閾値未満）なら false", () => {
    const cur = { ...base, tx: 0.2, yaw: 0.005, distance: 201 };
    expect(viewMovedFast(base, cur, 0.25, TH)).toBe(false);
  });
});
