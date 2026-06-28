import { describe, it, expect } from "vitest";
import { Rng, hashSeed } from "./rng";

describe("Rng", () => {
  it("同じシードからは同じ乱数列が得られる（再現性）", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("next() は [0, 1) の範囲を返す", () => {
    const rng = new Rng("seed");
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(min, max) は両端を含む範囲に収まる", () => {
    const rng = new Rng(1);
    for (let i = 0; i < 100; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("hashSeed は決定的で 32bit 符号なし整数を返す", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).toBeGreaterThanOrEqual(0);
    expect(hashSeed("abc")).toBeLessThanOrEqual(0xffffffff);
  });
});
