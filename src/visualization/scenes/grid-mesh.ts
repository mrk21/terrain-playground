/**
 * 3D 地形ノードの格子メッシュのインデックス（位相）を組み立てる。
 * 頂点座標には依存しない純粋な組み合わせ計算なので、LEAF_GRID 固定なら 1 本を全ノードで共有できる。
 *
 * 格子は n×n 頂点（n = leafGrid + 1）で、頂点 (i, j) のインデックスは j*n + i。
 * スカート（LOD 段差を隠す、外周を真下へ垂らす壁）の頂点は地表頂点の後ろ（base = n²）に並ぶ。
 */

/** n×n 格子の外周頂点（j*n+i）を時計回りに一周並べた配列。スカート生成に使う。 */
export function perimeterIndices(n: number): number[] {
  const p: number[] = [];
  for (let i = 0; i < n; i++) p.push(i); // 上辺 j=0
  for (let j = 1; j < n; j++) p.push(j * n + (n - 1)); // 右辺 i=n-1
  for (let i = n - 2; i >= 0; i--) p.push((n - 1) * n + i); // 下辺 j=n-1
  for (let j = n - 2; j >= 1; j--) p.push(j * n + 0); // 左辺 i=0
  return p;
}

/**
 * 地表（leafGrid² セルを各 2 三角形）とスカート（外周辺ごとに 2 三角形）の
 * インデックスをまとめた Uint16Array。カリング無効前提なので巻き順は不問。
 */
export function buildGridIndices(leafGrid: number): Uint16Array {
  const n = leafGrid + 1;
  const out: number[] = [];
  for (let j = 0; j < leafGrid; j++) {
    for (let i = 0; i < leafGrid; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      out.push(a, c, b, b, c, d);
    }
  }
  // スカート：外周の各辺を、真下に落としたコピー頂点（base 以降）とつなぐ壁。
  const peri = perimeterIndices(n);
  const P = peri.length;
  const base = n * n;
  for (let k = 0; k < P; k++) {
    const nk = (k + 1) % P;
    out.push(peri[k], base + k, peri[nk], peri[nk], base + k, base + nk);
  }
  return new Uint16Array(out);
}
