import { describe, expect, it } from "vitest";
import { MAX_HEIGHT } from "../../core/colormap";
import { bakeTileTexture } from "./tile-bake";

const RES = 4;

/** (i,j) 画素の RGBA を取り出す。 */
function texel(data: Uint8Array, i: number, j: number): number[] {
  const o = (j * RES + i) * 4;
  return [data[o], data[o + 1], data[o + 2], data[o + 3]];
}

describe("bakeTileTexture", () => {
  it("res×res×4 の RGBA で、α は常に 255", () => {
    const data = bakeTileTexture(() => 0, 0, 0, 256, RES);
    expect(data.length).toBe(RES * RES * 4);
    for (let k = 3; k < data.length; k += 4) expect(data[k]).toBe(255);
  });

  it("端を含むグリッドで高さ関数をサンプリングする（左上=原点, 右下=原点+tileWorld）", () => {
    const sampled: Array<[number, number]> = [];
    bakeTileTexture(
      (x, z) => {
        sampled.push([x, z]);
        return 0;
      },
      10,
      20,
      300, // tileWorld
      RES,
    );
    // i=0,j=0 は (ox,oz)。i=res-1,j=res-1 は (ox+tileWorld, oz+tileWorld)。
    expect(sampled[0]).toEqual([10, 20]);
    expect(sampled.at(-1)).toEqual([10 + 300, 20 + 300]);
  });

  it("MAX_HEIGHT を超える高さは MAX_HEIGHT にクランプして色付け（境界と同色）", () => {
    const over = bakeTileTexture(() => MAX_HEIGHT + 1000, 0, 0, 256, RES);
    const atMax = bakeTileTexture(() => MAX_HEIGHT, 0, 0, 256, RES);
    expect(texel(over, 0, 0)).toEqual(texel(atMax, 0, 0));
  });

  it("負の高さは 0 にクランプして色付け（水位下と同色）", () => {
    const below = bakeTileTexture(() => -50, 0, 0, 256, RES);
    const atZero = bakeTileTexture(() => 0, 0, 0, 256, RES);
    expect(texel(below, 0, 0)).toEqual(texel(atZero, 0, 0));
  });
});
