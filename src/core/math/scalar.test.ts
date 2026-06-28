import { describe, expect, it } from "vitest";
import { clamp, wrapAngleDelta } from "./scalar";

describe("clamp", () => {
  it("範囲内の値はそのまま返す", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("下限より小さい値は下限に丸める", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it("上限より大きい値は上限に丸める", () => {
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it("両端の値はそのまま返す（境界を含む）", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("負の範囲でも機能する", () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-20, -10, -1)).toBe(-10);
  });
});

describe("wrapAngleDelta", () => {
  it("(-π, π] の範囲内の差分はそのまま返す", () => {
    expect(wrapAngleDelta(0)).toBe(0);
    expect(wrapAngleDelta(1)).toBeCloseTo(1);
    expect(wrapAngleDelta(-1)).toBeCloseTo(-1);
  });

  it("π を超える差分は 2π を引いて (-π, π] に折り返す", () => {
    expect(wrapAngleDelta(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1);
  });

  it("-π を下回る差分は 2π を足して折り返す", () => {
    expect(wrapAngleDelta(-Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1);
  });

  it("ちょうど π / -π は折り返さない（半開区間 (-π, π]）", () => {
    expect(wrapAngleDelta(Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngleDelta(-Math.PI)).toBeCloseTo(-Math.PI);
  });
});
