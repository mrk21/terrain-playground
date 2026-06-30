import type { HeightMapFunc } from "../../algorithm/height";
import { heightToColor, MAX_HEIGHT } from "../../core/colormap";
import { clamp } from "../../core/math/scalar";

/**
 * タイル 1 枚ぶんのテクスチャ画素（res×res の RGBA）を高さ関数から焼く。
 * 2D シーンの環境非依存な核（GL/DOM 非依存）なのでここだけで TDD できる。
 *
 * 端を含むグリッド点（i/(res-1)）で取るので、隣接タイルが境界の列・行を共有し継ぎ目が出ない。
 * 高さは [0, MAX_HEIGHT] にクランプしてから colormap で色付けし、α は常に不透明。
 */
export function bakeTileTexture(
  height: HeightMapFunc,
  ox: number,
  oz: number,
  tileWorld: number,
  res: number,
): Uint8Array {
  const data = new Uint8Array(res * res * 4);
  for (let j = 0; j < res; j++) {
    const wz = oz + (j / (res - 1)) * tileWorld;
    for (let i = 0; i < res; i++) {
      const wx = ox + (i / (res - 1)) * tileWorld;
      const y = clamp(height(wx, wz), 0, MAX_HEIGHT);
      const [r, g, b] = heightToColor(y);
      const o = (j * res + i) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return data;
}
