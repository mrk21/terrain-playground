import { describe, expect, it } from "vitest";
import { selectTileLevel, tileVisible, zoomAtFocus } from "./tile-lod";

const BASE = 256;
const RES = 128;
const MAX = 12;

/** 焦点ピクセル (fx,fy) の下にあるワールド座標。 */
function worldUnder(
  s: { centerX: number; centerZ: number; viewHeight: number },
  fx: number,
  fy: number,
  w: number,
  h: number,
) {
  const wpp = s.viewHeight / h;
  return {
    x: s.centerX + (fx - w / 2) * wpp,
    z: s.centerZ + (fy - h / 2) * wpp,
  };
}

describe("selectTileLevel", () => {
  it("1テクセル≒1ピクセルになるレベルを選ぶ（指数がちょうど整数のとき）", () => {
    // worldPerPixel=2 → BASE/(RES*2)=1=2^0 → level 0
    expect(selectTileLevel(2000, 1000, BASE, RES, MAX)).toBe(0);
    // worldPerPixel=0.25 → BASE/(RES*0.25)=8=2^3 → level 3
    expect(selectTileLevel(250, 1000, BASE, RES, MAX)).toBe(3);
  });

  it("ズームアウトしすぎたら下限 0 にクランプ", () => {
    expect(selectTileLevel(100000, 1000, BASE, RES, MAX)).toBe(0);
  });

  it("ズームインしすぎたら上限 maxLevel にクランプ", () => {
    expect(selectTileLevel(0.001, 1000, BASE, RES, MAX)).toBe(MAX);
  });

  it("対数を四捨五入して最も近いレベルにする", () => {
    // worldPerPixel=0.3 → BASE/(RES*0.3)=6.666 → log2≈2.74 → round=3
    expect(selectTileLevel(300, 1000, BASE, RES, MAX)).toBe(3);
  });
});

describe("zoomAtFocus", () => {
  const w = 800;
  const h = 600;

  it("焦点の下のワールド座標はズーム前後で動かない（指の下が固定）", () => {
    const before = { centerX: 10, centerZ: -20, viewHeight: 200 };
    const fx = 600;
    const fy = 100;
    const after = zoomAtFocus(before, 2, fx, fy, w, h, 1, 2000);
    const wb = worldUnder(before, fx, fy, w, h);
    const wa = worldUnder(after, fx, fy, w, h);
    expect(wa.x).toBeCloseTo(wb.x);
    expect(wa.z).toBeCloseTo(wb.z);
  });

  it("factor>1 で viewHeight が factor 分縮む（拡大）", () => {
    const after = zoomAtFocus(
      { centerX: 0, centerZ: 0, viewHeight: 200 },
      2,
      400,
      300,
      w,
      h,
      1,
      2000,
    );
    expect(after.viewHeight).toBeCloseTo(100);
  });

  it("画面中心を焦点にすると中心は動かない", () => {
    const before = { centerX: 5, centerZ: 7, viewHeight: 200 };
    const after = zoomAtFocus(before, 1.5, w / 2, h / 2, w, h, 1, 2000);
    expect(after.centerX).toBeCloseTo(5);
    expect(after.centerZ).toBeCloseTo(7);
  });

  it("viewHeight は [min, max] にクランプされる", () => {
    const after = zoomAtFocus(
      { centerX: 0, centerZ: 0, viewHeight: 200 },
      1000,
      400,
      300,
      w,
      h,
      1,
      2000,
    );
    expect(after.viewHeight).toBe(1);
  });
});

describe("tileVisible", () => {
  // 可視範囲 [0,100]×[0,100]
  const view = { ax0: 0, ax1: 100, az0: 0, az1: 100 };
  const v = (ox: number, oz: number, tw: number) =>
    tileVisible(ox, oz, tw, view.ax0, view.ax1, view.az0, view.az1);

  it("可視範囲に重なるタイルは可視", () => {
    expect(v(20, 20, 10)).toBe(true);
  });

  it("可視範囲の完全に外（左）は不可視", () => {
    expect(v(-50, 20, 10)).toBe(false);
  });

  it("辺で接するだけ（重なり 0）は不可視（半開区間）", () => {
    // ox+tw == ax0
    expect(v(-10, 20, 10)).toBe(false);
    // ox == ax1
    expect(v(100, 20, 10)).toBe(false);
  });

  it("一部でも重なれば可視", () => {
    expect(v(95, 20, 10)).toBe(true);
  });
});
