import { describe, expect, it } from "vitest";
import { eyePosition, groundUnder } from "./terrain-camera";

const FOV = Math.PI / 4;

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
