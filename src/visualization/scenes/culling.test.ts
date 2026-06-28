import { describe, expect, it } from "vitest";
import {
  aabbInFrustum,
  extractFrustumPlanes,
  pointToAabbDistance,
} from "./culling";

/** 列優先（column-major）の単位行列。 */
const IDENTITY = new Float32Array([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

describe("extractFrustumPlanes", () => {
  it("単位 MVP からは NDC の単位立方体 [-1,1]³ の 6 平面が出る", () => {
    const planes = extractFrustumPlanes(IDENTITY);
    // left,right,bottom,top,near,far の順（各 [a,b,c,d]）。
    expect(Array.from(planes)).toEqual([
      1, 0, 0, 1, -1, 0, 0, 1, 0, 1, 0, 1, 0, -1, 0, 1, 0, 0, 1, 1, 0, 0, -1, 1,
    ]);
  });

  it("渡した out（長さ24）に書き込み、それを返す", () => {
    const out = new Float32Array(24);
    const ret = extractFrustumPlanes(IDENTITY, out);
    expect(ret).toBe(out);
    expect(out).toHaveLength(24);
  });
});

describe("aabbInFrustum", () => {
  const planes = extractFrustumPlanes(IDENTITY); // 単位立方体 [-1,1]³

  it("錐台内に完全に入る AABB は可視", () => {
    expect(aabbInFrustum(planes, -0.5, 0.5, -0.5, 0.5, -0.5, 0.5)).toBe(true);
  });

  it("錐台外の AABB は不可視", () => {
    expect(aabbInFrustum(planes, 2, 3, 2, 3, 2, 3)).toBe(false);
  });

  it("一部でも錐台に重なれば可視（保守的）", () => {
    expect(aabbInFrustum(planes, 0.5, 1.5, -0.5, 0.5, -0.5, 0.5)).toBe(true);
  });

  it("1 軸でも完全に外なら不可視", () => {
    expect(aabbInFrustum(planes, -0.5, 0.5, -3, -2, -0.5, 0.5)).toBe(false);
  });
});

describe("pointToAabbDistance", () => {
  it("AABB の内側にある点は距離 0", () => {
    expect(pointToAabbDistance(5, 5, 5, 0, 10, 0, 10, 0, 10)).toBe(0);
  });

  it("1 軸だけ外なら、その軸方向のはみ出し量", () => {
    expect(pointToAabbDistance(15, 5, 5, 0, 10, 0, 10, 0, 10)).toBeCloseTo(5);
  });

  it("複数軸で外なら、各軸のはみ出しのユークリッド距離", () => {
    // dx=3, dy=4, dz=0 → 5
    expect(pointToAabbDistance(13, 14, 5, 0, 10, 0, 10, 0, 10)).toBeCloseTo(5);
  });

  it("面の上にある点は距離 0", () => {
    expect(pointToAabbDistance(0, 5, 5, 0, 10, 0, 10, 0, 10)).toBe(0);
  });
});
