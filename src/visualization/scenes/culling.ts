/**
 * 視錐台カリングと LOD 距離判定のための環境非依存なジオメトリ。
 * いずれも素の数値（行列・座標）だけで動くので WebGL に依存しない。
 */
import { clamp } from "../../core/math/scalar";

/**
 * 列優先（column-major）の MVP から視錐台の 6 平面 [a,b,c,d]×6 を取り出す。
 * 並びは left, right, bottom, top, near, far。各平面は a*x+b*y+c*z+d>=0 が内側。
 */
export function extractFrustumPlanes(
  m: Float32Array,
  out: Float32Array = new Float32Array(24),
): Float32Array {
  const r00 = m[0],
    r01 = m[4],
    r02 = m[8],
    r03 = m[12];
  const r10 = m[1],
    r11 = m[5],
    r12 = m[9],
    r13 = m[13];
  const r20 = m[2],
    r21 = m[6],
    r22 = m[10],
    r23 = m[14];
  const r30 = m[3],
    r31 = m[7],
    r32 = m[11],
    r33 = m[15];
  out[0] = r30 + r00; // left
  out[1] = r31 + r01;
  out[2] = r32 + r02;
  out[3] = r33 + r03;
  out[4] = r30 - r00; // right
  out[5] = r31 - r01;
  out[6] = r32 - r02;
  out[7] = r33 - r03;
  out[8] = r30 + r10; // bottom
  out[9] = r31 + r11;
  out[10] = r32 + r12;
  out[11] = r33 + r13;
  out[12] = r30 - r10; // top
  out[13] = r31 - r11;
  out[14] = r32 - r12;
  out[15] = r33 - r13;
  out[16] = r30 + r20; // near
  out[17] = r31 + r21;
  out[18] = r32 + r22;
  out[19] = r33 + r23;
  out[20] = r30 - r20; // far
  out[21] = r31 - r21;
  out[22] = r32 - r22;
  out[23] = r33 - r23;
  return out;
}

/** AABB が視錐台に（一部でも）入るか。保守的（偽陽性あり）だが描画には十分。 */
export function aabbInFrustum(
  planes: Float32Array,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
): boolean {
  for (let i = 0; i < 6; i++) {
    const a = planes[i * 4],
      b = planes[i * 4 + 1],
      c = planes[i * 4 + 2],
      d = planes[i * 4 + 3];
    // 各平面の法線側に最も近い角（p-vertex）で判定する。
    const px = a >= 0 ? maxX : minX;
    const py = b >= 0 ? maxY : minY;
    const pz = c >= 0 ? maxZ : minZ;
    if (a * px + b * py + c * pz + d < 0) return false;
  }
  return true;
}

/** 点から AABB への最短ユークリッド距離（内側・面上は 0）。 */
export function pointToAabbDistance(
  px: number,
  py: number,
  pz: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
): number {
  const dx = px - clamp(px, minX, maxX);
  const dy = py - clamp(py, minY, maxY);
  const dz = pz - clamp(pz, minZ, maxZ);
  return Math.hypot(dx, dy, dz);
}
