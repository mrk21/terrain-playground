import { describe, expect, it } from "vitest";
import { twoFingerGesture } from "./gesture-math";

describe("twoFingerGesture", () => {
  it("2 点の重心・間隔・角度を返す（水平に並ぶ場合）", () => {
    const g = twoFingerGesture({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(g.cx).toBe(5);
    expect(g.cy).toBe(0);
    expect(g.dist).toBeCloseTo(10);
    expect(g.angle).toBeCloseTo(0);
  });

  it("角度は a→b 方向で測る（垂直なら π/2）", () => {
    const g = twoFingerGesture({ x: 0, y: 0 }, { x: 0, y: 4 });
    expect(g.dist).toBeCloseTo(4);
    expect(g.angle).toBeCloseTo(Math.PI / 2);
  });

  it("重心は順序に依らない", () => {
    const g1 = twoFingerGesture({ x: 2, y: 6 }, { x: 8, y: 10 });
    const g2 = twoFingerGesture({ x: 8, y: 10 }, { x: 2, y: 6 });
    expect(g1.cx).toBe(g2.cx);
    expect(g1.cy).toBe(g2.cy);
    expect(g1.dist).toBeCloseTo(g2.dist);
  });

  it("2 点が一致したとき dist は 0 でなく 1 に丸める（0 除算回避）", () => {
    const g = twoFingerGesture({ x: 3, y: 3 }, { x: 3, y: 3 });
    expect(g.dist).toBe(1);
    expect(g.cx).toBe(3);
    expect(g.cy).toBe(3);
  });
});
