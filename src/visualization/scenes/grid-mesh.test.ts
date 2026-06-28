import { describe, expect, it } from "vitest";
import { buildGridIndices, perimeterIndices } from "./grid-mesh";

/** 頂点インデックス idx を n×n 格子の (i, j) に戻す。 */
function toIJ(idx: number, n: number): { i: number; j: number } {
  return { i: idx % n, j: Math.floor(idx / n) };
}

describe("perimeterIndices", () => {
  it("外周頂点を時計回りに一周並べる（n=3 の既知の並び）", () => {
    // 3×3 格子（j*3+i）。上辺→右辺→下辺→左辺の順。
    expect(perimeterIndices(3)).toEqual([0, 1, 2, 5, 8, 7, 6, 3]);
  });

  it("n=2 の既知の並び", () => {
    expect(perimeterIndices(2)).toEqual([0, 1, 3, 2]);
  });

  it("外周の頂点数は 4(n-1)（角を重複させない）", () => {
    for (const n of [2, 3, 5, 65]) {
      expect(perimeterIndices(n)).toHaveLength(4 * (n - 1));
    }
  });

  it("すべて格子の外周頂点（i または j が端）で、重複がない", () => {
    const n = 8;
    const peri = perimeterIndices(n);
    expect(new Set(peri).size).toBe(peri.length); // 重複なし
    for (const idx of peri) {
      const { i, j } = toIJ(idx, n);
      const onEdge = i === 0 || i === n - 1 || j === 0 || j === n - 1;
      expect(onEdge).toBe(true);
    }
  });

  it("隣り合う頂点（末尾→先頭の巻き戻し含む）は格子上で隣接する（閉ループ）", () => {
    const n = 6;
    const peri = perimeterIndices(n);
    for (let k = 0; k < peri.length; k++) {
      const a = toIJ(peri[k], n);
      const b = toIJ(peri[(k + 1) % peri.length], n);
      const manhattan = Math.abs(a.i - b.i) + Math.abs(a.j - b.j);
      expect(manhattan).toBe(1);
    }
  });
});

describe("buildGridIndices", () => {
  it("Uint16Array を返す", () => {
    expect(buildGridIndices(2)).toBeInstanceOf(Uint16Array);
  });

  it("三角形数 = 地表(leafGrid²×2) + スカート(4×leafGrid×2)", () => {
    for (const leafGrid of [1, 2, 4, 64]) {
      const n = leafGrid + 1;
      const surface = leafGrid * leafGrid * 6;
      const skirt = 4 * (n - 1) * 6; // 外周辺の数 × 1 辺 2 三角形 × 3 頂点
      expect(buildGridIndices(leafGrid)).toHaveLength(surface + skirt);
    }
  });

  it("地表の先頭クアッドは a,c,b,b,c,d の並び（leafGrid=1）", () => {
    // N=2: a=0,b=1,c=2,d=3
    expect(Array.from(buildGridIndices(1).slice(0, 6))).toEqual([
      0, 2, 1, 1, 2, 3,
    ]);
  });

  it("すべてのインデックスが頂点数（N² + 外周数）未満に収まる", () => {
    const leafGrid = 4;
    const n = leafGrid + 1;
    const vcount = n * n + 4 * (n - 1);
    for (const idx of buildGridIndices(leafGrid)) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(vcount);
    }
  });
});
