/**
 * 3D 地形ノードの格子メッシュ（頂点座標・法線・高さ）を高さ関数から焼く純粋計算。
 * GL/DOM に触れない環境非依存の関数なので、ここだけで TDD できる。
 * インデックス（位相）は grid-mesh、定数は terrain3d-config が持つ。
 */
import type { HeightMapFunc } from "../../algorithm/height";
import { MAX_HEIGHT } from "../../core/colormap";
import { clamp } from "../../core/math/scalar";
import { perimeterIndices } from "./grid-mesh";
import { HEIGHT_SCALE, LEAF_GRID, N, SKIRT_DEPTH } from "./terrain3d-config";

/** ノードメッシュの頂点属性（GL へ上げる生データ）。 */
export interface NodeMesh {
  positions: Float32Array;
  normals: Float32Array;
  heights: Float32Array; // 真の高さ(0..128)。色はフラグメントで決める。
}

/** 真の高さを地形の有効レンジ [0, MAX_HEIGHT] に収める。 */
export function clampHeight(y: number): number {
  return clamp(y, 0, MAX_HEIGHT);
}

/**
 * 原点 (ox,oz)・一辺 size のノードのメッシュを LEAF_GRID で作る。
 * 高さは中央差分で法線を出し、外周はスカート（真下へ垂らす壁）として複製する。
 */
export function buildNodeMesh(
  height: HeightMapFunc,
  ox: number,
  oz: number,
  size: number,
): NodeMesh {
  const spacing = size / LEAF_GRID;

  // 縁を 1 つ含む高さグリッド（(N+2)²）。法線の境界一致のため。
  const B = N + 2;
  const hb = new Float32Array(B * B);
  for (let j = -1; j <= N; j++) {
    const wz = oz + j * spacing;
    for (let i = -1; i <= N; i++) {
      const wx = ox + i * spacing;
      hb[(j + 1) * B + (i + 1)] = clampHeight(height(wx, wz));
    }
  }
  const at = (i: number, j: number): number => hb[(j + 1) * B + (i + 1)];

  const peri = perimeterIndices(N);
  const vcount = N * N + peri.length;
  const positions = new Float32Array(vcount * 3);
  const normals = new Float32Array(vcount * 3);
  const heights = new Float32Array(vcount);

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      const y = at(i, j);
      positions[idx * 3] = ox + i * spacing;
      positions[idx * 3 + 1] = y * HEIGHT_SCALE;
      positions[idx * 3 + 2] = oz + j * spacing;

      const dhdx =
        ((at(i + 1, j) - at(i - 1, j)) * HEIGHT_SCALE) / (2 * spacing);
      const dhdz =
        ((at(i, j + 1) - at(i, j - 1)) * HEIGHT_SCALE) / (2 * spacing);
      const nx = -dhdx;
      const nz = -dhdz;
      const len = Math.hypot(nx, 1, nz) || 1;
      normals[idx * 3] = nx / len;
      normals[idx * 3 + 1] = 1 / len;
      normals[idx * 3 + 2] = nz / len;

      heights[idx] = y;
    }
  }

  // スカート：外周頂点を真下に落としたコピー。
  for (let k = 0; k < peri.length; k++) {
    const s = peri[k];
    const d = N * N + k;
    positions[d * 3] = positions[s * 3];
    positions[d * 3 + 1] = positions[s * 3 + 1] - SKIRT_DEPTH;
    positions[d * 3 + 2] = positions[s * 3 + 2];
    normals[d * 3] = normals[s * 3];
    normals[d * 3 + 1] = normals[s * 3 + 1];
    normals[d * 3 + 2] = normals[s * 3 + 2];
    heights[d] = heights[s];
  }

  return { positions, normals, heights };
}
