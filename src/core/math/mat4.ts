/**
 * 最小限の 4x4 行列ユーティリティ（列優先 / column-major）。
 * WebGL の uniformMatrix4fv はそのまま列優先で受け取れる。
 */
export type Mat4 = Float32Array;

export function create(): Mat4 {
  return new Float32Array(16);
}

export function identity(out: Mat4 = create()): Mat4 {
  out.fill(0);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

/** 透視投影行列。fovY はラジアン。 */
export function perspective(
  fovYRadians: number,
  aspect: number,
  near: number,
  far: number,
  out: Mat4 = create(),
): Mat4 {
  const f = 1 / Math.tan(fovYRadians / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

/** out = a * b （列優先）。out が a または b と同一でも安全。 */
export function multiply(a: Mat4, b: Mat4, out: Mat4 = create()): Mat4 {
  const a00 = a[0],
    a01 = a[1],
    a02 = a[2],
    a03 = a[3];
  const a10 = a[4],
    a11 = a[5],
    a12 = a[6],
    a13 = a[7];
  const a20 = a[8],
    a21 = a[9],
    a22 = a[10],
    a23 = a[11];
  const a30 = a[12],
    a31 = a[13],
    a32 = a[14],
    a33 = a[15];

  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4],
      b1 = b[i * 4 + 1],
      b2 = b[i * 4 + 2],
      b3 = b[i * 4 + 3];
    out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return out;
}

export function translation(
  x: number,
  y: number,
  z: number,
  out: Mat4 = create(),
): Mat4 {
  identity(out);
  out[12] = x;
  out[13] = y;
  out[14] = z;
  return out;
}

export function rotationX(rad: number, out: Mat4 = create()): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  identity(out);
  out[5] = c;
  out[6] = s;
  out[9] = -s;
  out[10] = c;
  return out;
}

export function rotationY(rad: number, out: Mat4 = create()): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  identity(out);
  out[0] = c;
  out[2] = -s;
  out[8] = s;
  out[10] = c;
  return out;
}

export function rotationZ(rad: number, out: Mat4 = create()): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  identity(out);
  out[0] = c;
  out[1] = s;
  out[4] = -s;
  out[5] = c;
  return out;
}
