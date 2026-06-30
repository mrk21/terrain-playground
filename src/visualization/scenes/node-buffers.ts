/**
 * 1 ノード分の WebGL リソース（VAO と頂点属性バッファ）の生成・解放。
 * node-mesh が焼いた頂点データ（NodeMesh）を GPU バッファに載せる/外す GL 配線だけを担う。
 * どのノードを保持・描画するかの判断（クアッドツリー LOD）は terrain-tiles が持つ。
 */
import type { HeightMapFunc } from "../../algorithm/height";
import { buildGridIndices } from "./grid-mesh";
import { buildNodeMesh } from "./node-mesh";
import { LEAF_GRID, ROOT_SIZE } from "./terrain3d-config";

/** 1 ノードの GL リソース（頂点配列と各属性バッファ）。 */
export interface NodeBuffers {
  vao: WebGLVertexArrayObject;
  posBuf: WebGLBuffer;
  norBuf: WebGLBuffer;
  hgtBuf: WebGLBuffer;
}

/** ノードバッファの生成・解放を担うファクトリ（index バッファは全ノード共有）。 */
export interface NodeBufferFactory {
  /** 全ノード共通の index 数（描画コールの要素数）。 */
  readonly indexCount: number;
  /** 深さ・格子座標のノードのメッシュを焼いて GL バッファ群を作る。 */
  build(
    height: HeightMapFunc,
    depth: number,
    nx: number,
    nz: number,
  ): NodeBuffers;
  /** 1 ノードのバッファ群を解放する。 */
  dispose(node: NodeBuffers): void;
  /** 全ノード共通の index バッファを解放する（破棄時に 1 回）。 */
  disposeShared(): void;
}

export function createNodeBuffers(
  gl: WebGL2RenderingContext,
): NodeBufferFactory {
  // 全ノード共通の index バッファ（位相は LEAF_GRID 固定なので 1 本で済む）。
  const indices = buildGridIndices(LEAF_GRID);
  const indexCount = indices.length;
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  const makeBuffer = (
    location: number,
    data: Float32Array,
    size: number,
  ): WebGLBuffer => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    return buffer;
  };

  return {
    indexCount,
    build(height, depth, nx, nz) {
      const size = ROOT_SIZE / 2 ** depth;
      const mesh = buildNodeMesh(height, nx * size, nz * size, size);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const posBuf = makeBuffer(0, mesh.positions, 3);
      const norBuf = makeBuffer(1, mesh.normals, 3);
      const hgtBuf = makeBuffer(2, mesh.heights, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bindVertexArray(null);
      return { vao, posBuf, norBuf, hgtBuf };
    },
    dispose(node) {
      gl.deleteVertexArray(node.vao);
      gl.deleteBuffer(node.posBuf);
      gl.deleteBuffer(node.norBuf);
      gl.deleteBuffer(node.hgtBuf);
    },
    disposeShared() {
      gl.deleteBuffer(indexBuffer);
    },
  };
}
