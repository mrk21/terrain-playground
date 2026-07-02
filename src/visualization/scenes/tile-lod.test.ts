import { describe, expect, it } from "vitest";
import {
  rotateViewAround,
  screenOffsetToWorld,
  screenToWorld,
  selectTileLevel,
  tileVisible,
  viewAabbHalfExtents,
  zoomAtFocus,
} from "./tile-lod";

const HALF_PI = Math.PI / 2;

const BASE = 256;
const RES = 128;
const MAX = 12;

describe("screenToWorld", () => {
  const w = 800;
  const h = 600;

  it("画面中心はビュー中心のワールド座標", () => {
    const p = screenToWorld(
      { centerX: 10, centerZ: -5, viewHeight: 200 },
      400,
      300,
      w,
      h,
    );
    expect(p.x).toBeCloseTo(10);
    expect(p.z).toBeCloseTo(-5);
  });

  it("中心から右・下にずれると worldPerPx(=viewHeight/h) 分だけ +x/+z", () => {
    // viewHeight 200, h 600 → worldPerPx = 1/3
    const p = screenToWorld(
      { centerX: 0, centerZ: 0, viewHeight: 200 },
      400 + 30,
      300 + 60,
      w,
      h,
    );
    expect(p.x).toBeCloseTo(10); // 30px * 1/3
    expect(p.z).toBeCloseTo(20); // 60px * 1/3
  });

  it("水平も垂直と同じスケール（halfX = halfY*aspect のため worldPerPx は共通）", () => {
    const p = screenToWorld(
      { centerX: 0, centerZ: 0, viewHeight: 600 },
      0,
      0,
      w,
      h,
    );
    // worldPerPx = 600/600 = 1。左上端は中心から (-400,-300)px。
    expect(p.x).toBeCloseTo(-400);
    expect(p.z).toBeCloseTo(-300);
  });

  it("画面中心はビューが回転していてもビュー中心のワールド座標", () => {
    const p = screenToWorld(
      { centerX: 10, centerZ: -5, viewHeight: 200, heading: HALF_PI },
      400,
      300,
      w,
      h,
    );
    expect(p.x).toBeCloseTo(10);
    expect(p.z).toBeCloseTo(-5);
  });

  it("heading=π/2 では画面の右方向がワールド +z に写る（地図を90°回した向き）", () => {
    // worldPerPx = 600/600 = 1。中心の右 30px の点。
    const p = screenToWorld(
      { centerX: 0, centerZ: 0, viewHeight: 600, heading: HALF_PI },
      400 + 30,
      300,
      w,
      h,
    );
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(30);
  });
});

describe("screenOffsetToWorld", () => {
  it("heading=0 では画面オフセット(px方向)がそのままワールド (dx,dz)", () => {
    const o = screenOffsetToWorld(30, 60, 0);
    expect(o.dx).toBeCloseTo(30);
    expect(o.dz).toBeCloseTo(60);
  });

  it("heading=π/2 では画面右→ワールド+z・画面下→ワールド−x", () => {
    // right=(0,1), down=(-1,0)。offset = sx*right + sy*down = (-sy, sx)
    const o = screenOffsetToWorld(30, 60, HALF_PI);
    expect(o.dx).toBeCloseTo(-60);
    expect(o.dz).toBeCloseTo(30);
  });

  it("回転しても長さ（画面オフセットのノルム）は保たれる", () => {
    const o = screenOffsetToWorld(30, 60, 0.9);
    expect(Math.hypot(o.dx, o.dz)).toBeCloseTo(Math.hypot(30, 60));
  });
});

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
    const wb = screenToWorld(before, fx, fy, w, h);
    const wa = screenToWorld(after, fx, fy, w, h);
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

  it("ビューが回転していても焦点の下のワールド座標は動かない", () => {
    const before = {
      centerX: 10,
      centerZ: -20,
      viewHeight: 200,
      heading: 0.7,
    };
    const fx = 600;
    const fy = 100;
    const after = zoomAtFocus(before, 2, fx, fy, w, h, 1, 2000);
    const wb = screenToWorld(before, fx, fy, w, h);
    const wa = screenToWorld(after, fx, fy, w, h);
    expect(wa.x).toBeCloseTo(wb.x);
    expect(wa.z).toBeCloseTo(wb.z);
    expect(after.heading).toBeCloseTo(0.7); // ズームは向きを変えない
  });
});

describe("rotateViewAround", () => {
  const w = 800;
  const h = 600;

  it("heading が dHeading 分だけ増える", () => {
    const after = rotateViewAround(
      { centerX: 0, centerZ: 0, viewHeight: 200, heading: 0.2 },
      0.5,
      400,
      300,
      w,
      h,
    );
    expect(after.heading).toBeCloseTo(0.7);
  });

  it("焦点の下のワールド座標は回転前後で動かない（指の下が固定）", () => {
    const before = { centerX: 10, centerZ: -20, viewHeight: 200 };
    const fx = 620;
    const fy = 140;
    const after = rotateViewAround(before, 0.6, fx, fy, w, h);
    const wb = screenToWorld(before, fx, fy, w, h);
    const wa = screenToWorld(after, fx, fy, w, h);
    expect(wa.x).toBeCloseTo(wb.x);
    expect(wa.z).toBeCloseTo(wb.z);
  });

  it("画面中心を軸に回すと中心は動かない", () => {
    const before = { centerX: 5, centerZ: 7, viewHeight: 200, heading: 0.1 };
    const after = rotateViewAround(before, 0.4, w / 2, h / 2, w, h);
    expect(after.centerX).toBeCloseTo(5);
    expect(after.centerZ).toBeCloseTo(7);
  });
});

describe("viewAabbHalfExtents", () => {
  it("heading=0 では回転前の半幅そのまま", () => {
    const e = viewAabbHalfExtents(160, 100, 0);
    expect(e.halfX).toBeCloseTo(160);
    expect(e.halfZ).toBeCloseTo(100);
  });

  it("heading=π/2 では x と z の半幅が入れ替わる", () => {
    const e = viewAabbHalfExtents(160, 100, HALF_PI);
    expect(e.halfX).toBeCloseTo(100);
    expect(e.halfZ).toBeCloseTo(160);
  });

  it("heading=π/4 では両軸とも (halfX+halfY)/√2 まで広がる", () => {
    const e = viewAabbHalfExtents(160, 100, Math.PI / 4);
    const expected = (160 + 100) / Math.SQRT2;
    expect(e.halfX).toBeCloseTo(expected);
    expect(e.halfZ).toBeCloseTo(expected);
  });

  it("負の heading でも対称（絶対値で効く）", () => {
    const a = viewAabbHalfExtents(160, 100, -0.6);
    const b = viewAabbHalfExtents(160, 100, 0.6);
    expect(a.halfX).toBeCloseTo(b.halfX);
    expect(a.halfZ).toBeCloseTo(b.halfZ);
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
