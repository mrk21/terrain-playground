import { describe, expect, it } from "vitest";
import { eyePosition, groundUnder, raycastSurface } from "./terrain-camera";

const FOV = Math.PI / 4;

/** 一定の高さを返す平坦な地表面。 */
const flat = (y: number) => () => y;
/** 地形の高さの値域（height*HEIGHT_SCALE = 0〜25.6）を模した探索バンド。 */
const BAND = { minY: 0, maxY: 25.6 };

describe("eyePosition", () => {
  it("真上ビュー（pitch=π/2）では target の真上 distance に立つ", () => {
    const eye = eyePosition({ yaw: 0, pitch: Math.PI / 2 }, [0, 5, 0], 100);
    expect(eye[0]).toBeCloseTo(0);
    expect(eye[1]).toBeCloseTo(105); // target.y + distance
    expect(eye[2]).toBeCloseTo(0);
  });

  it("水平・北向き（yaw=0,pitch=0）では +Z 方向に distance 下がる", () => {
    const eye = eyePosition({ yaw: 0, pitch: 0 }, [0, 0, 0], 100);
    expect(eye[0]).toBeCloseTo(0);
    expect(eye[1]).toBeCloseTo(0);
    expect(eye[2]).toBeCloseTo(100);
  });
});

describe("groundUnder", () => {
  const viewport = { w: 800, h: 600 };

  it("真上ビューの画面中心は注視点の (x,z) に刺さる", () => {
    const hit = groundUnder(
      { yaw: 0, pitch: Math.PI / 2, fov: FOV, target: [7, 5, -3] },
      viewport,
      [400, 300],
      100,
    );
    expect(hit).not.toBeNull();
    expect(hit?.[0]).toBeCloseTo(7);
    expect(hit?.[1]).toBeCloseTo(-3);
  });

  it("水平を向く（pitch=0）と地表と交わらず null", () => {
    const hit = groundUnder(
      { yaw: 0, pitch: 0, fov: FOV, target: [0, 0, 0] },
      viewport,
      [400, 300],
      100,
    );
    expect(hit).toBeNull();
  });

  it("真上ビューで画面中心より右の点は注視点より +x に刺さる（z は不動）", () => {
    const hit = groundUnder(
      { yaw: 0, pitch: Math.PI / 2, fov: FOV, target: [0, 5, 0] },
      viewport,
      [600, 300], // 中心より右
      100,
    );
    expect(hit).not.toBeNull();
    expect(hit?.[0]).toBeGreaterThan(0);
    expect(hit?.[1]).toBeCloseTo(0);
  });
});

describe("raycastSurface", () => {
  const viewport = { w: 800, h: 600 };

  it("真上ビューの画面中心は注視点の (x,z) に刺さる（平坦な地表）", () => {
    const hit = raycastSurface(
      { yaw: 0, pitch: Math.PI / 2, fov: FOV, target: [7, 12.8, -3] },
      viewport,
      [400, 300],
      100,
      flat(5),
      BAND,
    );
    expect(hit).not.toBeNull();
    expect(hit?.[0]).toBeCloseTo(7);
    expect(hit?.[1]).toBeCloseTo(-3);
  });

  it("斜めビューでは平面 target.y ではなく実際の地表面の高さと交わる", () => {
    // yaw=0, pitch=π/4, 画面中心では ray 上で ray.y = ray.z + target.y。
    // 平坦地表 y=5 との交点は z = 5 - target.y = -7.8（平面 target.y=12.8 なら z=0）。
    const hit = raycastSurface(
      { yaw: 0, pitch: Math.PI / 4, fov: FOV, target: [0, 12.8, 0] },
      viewport,
      [400, 300],
      100,
      flat(5),
      BAND,
    );
    expect(hit).not.toBeNull();
    expect(hit?.[0]).toBeCloseTo(0);
    expect(hit?.[1]).toBeCloseTo(-7.8);
  });

  it("地表面が注視点の高さと同じなら groundUnder（平面交差）と一致する", () => {
    const cam = {
      yaw: 0.7,
      pitch: Math.PI / 3,
      fov: FOV,
      target: [3, 12.8, -2] as [number, number, number],
    };
    const screen: [number, number] = [520, 240];
    const surf = raycastSurface(cam, viewport, screen, 100, flat(12.8), BAND);
    const plane = groundUnder(cam, viewport, screen, 100);
    expect(surf).not.toBeNull();
    expect(plane).not.toBeNull();
    expect(surf?.[0]).toBeCloseTo(plane?.[0] ?? Number.NaN);
    expect(surf?.[1]).toBeCloseTo(plane?.[1] ?? Number.NaN);
  });

  it("手前の丘に遮られたら、奥の地面ではなく手前の丘の交点を返す", () => {
    // ray 上で ray.y = ray.z + 12.8、z は 12.8→-12.8 と減っていく。
    // z∈[4,6] だけ高さ25 の丘。手前（z 大）から来て z=6 で丘に刺さる。
    const hill = (_x: number, z: number) => (z >= 4 && z <= 6 ? 25 : 0);
    const hit = raycastSurface(
      { yaw: 0, pitch: Math.PI / 4, fov: FOV, target: [0, 12.8, 0] },
      viewport,
      [400, 300],
      100,
      hill,
      BAND,
    );
    expect(hit).not.toBeNull();
    expect(hit?.[1]).toBeCloseTo(6, 1);
  });

  it("描画距離 maxDistance より遠い交点は返さない（打ち切り）", () => {
    // 斜めビュー・平坦地表 y=5 の交点はレイ長 t≈111 の位置（[0,-7.8]）。
    const cam = {
      yaw: 0,
      pitch: Math.PI / 4,
      fov: FOV,
      target: [0, 12.8, 0] as [number, number, number],
    };
    const reach = raycastSurface(
      cam,
      viewport,
      [400, 300],
      100,
      flat(5),
      BAND,
      200,
    );
    const cutoff = raycastSurface(
      cam,
      viewport,
      [400, 300],
      100,
      flat(5),
      BAND,
      50,
    );
    expect(reach?.[1]).toBeCloseTo(-7.8); // 200 なら届く
    expect(cutoff).toBeNull(); // 50 で打ち切ると届かない
  });

  it("地平線より上（空）を指すと null", () => {
    // pitch=0.2 は画角の半分(π/8≈0.39)より浅いので、画面上端は上を向く。
    const hit = raycastSurface(
      { yaw: 0, pitch: 0.2, fov: FOV, target: [0, 12.8, 0] },
      viewport,
      [400, 0],
      100,
      flat(5),
      BAND,
    );
    expect(hit).toBeNull();
  });
});
