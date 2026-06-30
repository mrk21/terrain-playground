import { describe, expect, it } from "vitest";
import { MAX_HEIGHT } from "../../core/colormap";
import { perimeterIndices } from "./grid-mesh";
import { buildNodeMesh, clampHeight } from "./node-mesh";
import { HEIGHT_SCALE, LEAF_GRID, N, SKIRT_DEPTH } from "./terrain3d-config";

const PERI_LEN = perimeterIndices(N).length;
const SURFACE = N * N;

describe("clampHeight", () => {
  it("レンジ内はそのまま、外は [0, MAX_HEIGHT] に丸める", () => {
    expect(clampHeight(10)).toBe(10);
    expect(clampHeight(-5)).toBe(0);
    expect(clampHeight(MAX_HEIGHT + 50)).toBe(MAX_HEIGHT);
  });
});

describe("buildNodeMesh", () => {
  it("頂点数 = 地表(N²) + スカート外周。各配列の長さが一致する", () => {
    const m = buildNodeMesh(() => 0, 0, 0, LEAF_GRID);
    const vcount = SURFACE + PERI_LEN;
    expect(m.positions).toHaveLength(vcount * 3);
    expect(m.normals).toHaveLength(vcount * 3);
    expect(m.heights).toHaveLength(vcount);
  });

  it("平坦な地形：頂点は格子位置に並び、高さは HEIGHT_SCALE 倍、法線は真上(0,1,0)", () => {
    // size=LEAF_GRID なので spacing=1。原点(0,0)。
    const m = buildNodeMesh(() => 10, 0, 0, LEAF_GRID);
    const i = 3;
    const j = 5;
    const idx = j * N + i;
    expect(m.positions[idx * 3]).toBeCloseTo(i); // x = ox + i*spacing
    expect(m.positions[idx * 3 + 1]).toBeCloseTo(10 * HEIGHT_SCALE); // y = h*scale
    expect(m.positions[idx * 3 + 2]).toBeCloseTo(j); // z = oz + j*spacing
    expect(m.normals[idx * 3]).toBeCloseTo(0);
    expect(m.normals[idx * 3 + 1]).toBeCloseTo(1);
    expect(m.normals[idx * 3 + 2]).toBeCloseTo(0);
    expect(m.heights[idx]).toBe(10); // heights は真の高さ（スケール前）
  });

  it("高さは [0, MAX_HEIGHT] にクランプされる（負・超過とも）", () => {
    const low = buildNodeMesh(() => -5, 0, 0, LEAF_GRID);
    const high = buildNodeMesh(() => MAX_HEIGHT + 100, 0, 0, LEAF_GRID);
    expect(low.heights[0]).toBe(0);
    expect(low.positions[1]).toBeCloseTo(0); // y = 0*scale
    expect(high.heights[0]).toBe(MAX_HEIGHT);
    expect(high.positions[1]).toBeCloseTo(MAX_HEIGHT * HEIGHT_SCALE);
  });

  it("スカート頂点は元の外周頂点を SKIRT_DEPTH だけ真下に落としたコピー", () => {
    const m = buildNodeMesh((x) => 8 + x * 0.1, 0, 0, LEAF_GRID);
    const peri = perimeterIndices(N);
    for (let k = 0; k < peri.length; k++) {
      const s = peri[k];
      const d = SURFACE + k;
      expect(m.positions[d * 3]).toBeCloseTo(m.positions[s * 3]); // x 同じ
      expect(m.positions[d * 3 + 1]).toBeCloseTo(
        m.positions[s * 3 + 1] - SKIRT_DEPTH, // y は SKIRT_DEPTH 下
      );
      expect(m.positions[d * 3 + 2]).toBeCloseTo(m.positions[s * 3 + 2]); // z 同じ
      expect(m.heights[d]).toBe(m.heights[s]); // 高さ・法線は外周頂点を引き継ぐ
      expect(m.normals[d * 3]).toBeCloseTo(m.normals[s * 3]);
    }
  });

  it("x 方向に増える斜面：法線は -x 側へ傾く（z 成分は不動）", () => {
    // height = x（dh/dx>0）。法線 nx = -dh/dx < 0、nz = 0。
    const m = buildNodeMesh((x) => x, 0, 0, LEAF_GRID);
    const idx = 5 * N + 3; // 内側の頂点
    expect(m.normals[idx * 3]).toBeLessThan(0);
    expect(m.normals[idx * 3 + 2]).toBeCloseTo(0);
    expect(m.normals[idx * 3 + 1]).toBeGreaterThan(0);
  });
});
