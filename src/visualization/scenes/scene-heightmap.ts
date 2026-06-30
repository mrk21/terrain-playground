import type { HeightMapFunc } from "../../algorithm/height";
import { createProgram } from "../gl/shader";
import { attachGestures } from "../input/gestures";
import fragSrc from "../shaders/tile.frag?raw";
import vertSrc from "../shaders/tile.vert?raw";
import type { Scene } from "./scene";
import { bakeTileTexture } from "./tile-bake";
import {
  screenToWorld,
  selectTileLevel,
  tileVisible,
  zoomAtFocus,
} from "./tile-lod";

/**
 * Google Maps 風のタイルピラミッド（クアッドツリー）LOD で地形を真上から表示する 2D シーン。
 *
 *   - ズームに応じて「1テクセル ≒ 1ピクセル」になるレベルを選ぶ。
 *     拡大すると深いレベル＝小さいタイルに切り替わり、height() を高解像度で
 *     サンプリングし直すので、拡大コピーのようにガビガビにならず常にくっきり。
 *   - 現在レベルのタイルを動的生成し、読み込み中は粗いレベルのタイルを下敷きにする。
 *   - 可視範囲から外れたタイルは解放する。
 */

/** レベル0タイルのワールド長。レベルが1上がるごとに半分になる。 */
const BASE_TILE_WORLD = 256;
/** タイルテクスチャの解像度（一辺）。全レベル共通。 */
const TILE_RES = 128;
/** LOD レベルの上限（拡大しすぎ防止）。 */
const MAX_LEVEL = 12;
/** 可視範囲の外側にどれだけ余分に読むか（パンの先読み・現在レベルのタイル数）。 */
const TILE_MARGIN = 1;
/** 現在レベルから何段ぶん粗いタイルをフォールバック用に保持・描画するか。 */
const KEEP_COARSER = 3;
/** 1 フレームに新規生成するタイル数（カクつき防止）。 */
const BUDGET_PER_FRAME = 3;

/** ズーム（垂直方向に映すワールド長）の初期値と上下限。 */
const DEFAULT_VIEW_HEIGHT = 200;
const MIN_VIEW_HEIGHT = 1;
const MAX_VIEW_HEIGHT = 2000;

interface Tile {
  level: number;
  ox: number;
  oz: number;
  tileWorld: number;
  texture: WebGLTexture;
  lastUsed: number;
}

export function createSceneHeightmap(
  gl: WebGL2RenderingContext,
  heightFunc: HeightMapFunc,
): Scene {
  // 高さ関数は setHeight() で差し替えられる。タイルはこの関数でサンプリングする。
  let height = heightFunc;

  const program = createProgram(gl, vertSrc, fragSrc);
  // 属性なし描画でも WebGL2 では VAO のバインドが必要。
  const vao = gl.createVertexArray();

  const uTileOrigin = gl.getUniformLocation(program, "uTileOrigin");
  const uTileSize = gl.getUniformLocation(program, "uTileSize");
  const uViewCenter = gl.getUniformLocation(program, "uViewCenter");
  const uHalfSpan = gl.getUniformLocation(program, "uHalfSpan");
  const uMap = gl.getUniformLocation(program, "uMap");

  // タイルキャッシュ。キーは `${level},${cx},${cz}`。
  const cache = new Map<string, Tile>();
  let frame = 0;
  // 現レベルの可視タイルが欠けていない（＝くっきり描けている）か。
  let settled = false;

  const createTile = (level: number, cx: number, cz: number): Tile => {
    const tileWorld = BASE_TILE_WORLD / 2 ** level;
    const ox = cx * tileWorld;
    const oz = cz * tileWorld;

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      TILE_RES,
      TILE_RES,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bakeTileTexture(height, ox, oz, tileWorld, TILE_RES),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return { level, ox, oz, tileWorld, texture, lastUsed: frame };
  };

  // --- ビュー状態（1本指/ドラッグでパン・ピンチ/ホイールでズーム） ---
  let centerX = 0;
  let centerZ = 0;
  let viewHeight = DEFAULT_VIEW_HEIGHT;

  const canvas = gl.canvas as HTMLCanvasElement;

  // 焦点 (fx,fy)（canvas 相対 CSS px）の地点が動かないようズームする。
  // factor>1 で拡大（viewHeight を縮める）。Google Maps の「指の下が動かない」挙動。
  const zoomAt = (factor: number, fx: number, fy: number): void => {
    const next = zoomAtFocus(
      { centerX, centerZ, viewHeight },
      factor,
      fx,
      fy,
      canvas.clientWidth,
      canvas.clientHeight,
      MIN_VIEW_HEIGHT,
      MAX_VIEW_HEIGHT,
    );
    centerX = next.centerX;
    centerZ = next.centerZ;
    viewHeight = next.viewHeight;
  };

  const detachGestures = attachGestures(canvas, {
    onDrag(dx, dy) {
      // 中身が指に追従するよう中心を逆に動かす（水平・垂直で同じスケール）。
      const worldPerPx = viewHeight / canvas.clientHeight;
      centerX -= dx * worldPerPx;
      centerZ -= dy * worldPerPx;
    },
    onPinch(scale, fx, fy) {
      zoomAt(scale, fx, fy);
    },
    onWheelZoom(deltaY, fx, fy) {
      zoomAt(Math.exp(-deltaY * 0.001), fx, fy);
    },
  });

  const hud = document.querySelector<HTMLElement>("#hud");

  const disposeTile = (key: string, tile: Tile): void => {
    gl.deleteTexture(tile.texture);
    cache.delete(key);
  };

  return {
    render() {
      frame++;
      gl.disable(gl.DEPTH_TEST);
      gl.clearColor(0.04, 0.04, 0.05, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
      const halfY = viewHeight / 2;
      const halfX = halfY * aspect;

      // 1テクセル≒1ピクセルになるレベルを選ぶ。
      const level = selectTileLevel(
        viewHeight,
        gl.drawingBufferHeight,
        BASE_TILE_WORLD,
        TILE_RES,
        MAX_LEVEL,
      );
      const tileWorld = BASE_TILE_WORLD / 2 ** level;

      // 可視範囲（＋パン先読みマージン）。
      const margin = TILE_MARGIN * tileWorld;
      const ax0 = centerX - halfX - margin;
      const ax1 = centerX + halfX + margin;
      const az0 = centerZ - halfY - margin;
      const az1 = centerZ + halfY + margin;

      // --- 現在レベルの未生成タイルを近い順に budget 個生成 ---
      const cxMin = Math.floor(ax0 / tileWorld);
      const cxMax = Math.floor(ax1 / tileWorld);
      const czMin = Math.floor(az0 / tileWorld);
      const czMax = Math.floor(az1 / tileWorld);
      const missing: { cx: number; cz: number; d2: number }[] = [];
      for (let cz = czMin; cz <= czMax; cz++) {
        for (let cx = cxMin; cx <= cxMax; cx++) {
          const key = `${level},${cx},${cz}`;
          const t = cache.get(key);
          if (t) {
            t.lastUsed = frame;
          } else {
            const tcx = (cx + 0.5) * tileWorld;
            const tcz = (cz + 0.5) * tileWorld;
            const d2 = (tcx - centerX) ** 2 + (tcz - centerZ) ** 2;
            missing.push({ cx, cz, d2 });
          }
        }
      }
      // 現レベルの可視タイルがすべて揃っていれば収束（このフレームで作る分が無い）。
      settled = missing.length === 0;
      if (missing.length > 0) {
        missing.sort((a, b) => a.d2 - b.d2);
        const n = Math.min(missing.length, BUDGET_PER_FRAME);
        for (let i = 0; i < n; i++) {
          const m = missing[i];
          cache.set(`${level},${m.cx},${m.cz}`, createTile(level, m.cx, m.cz));
        }
      }

      // --- 描画リスト：可視 ∩ [level-KEEP_COARSER, level] のタイルを集めて印を付ける ---
      const visible: Tile[] = [];
      for (const tile of cache.values()) {
        if (tile.level > level || tile.level < level - KEEP_COARSER) continue;
        if (!tileVisible(tile.ox, tile.oz, tile.tileWorld, ax0, ax1, az0, az1))
          continue; // 可視範囲外
        tile.lastUsed = frame;
        visible.push(tile);
      }
      // 粗いレベルを下、細かいレベルを上に重ね描き（読み込み中は粗いタイルが透けて見える）。
      visible.sort((a, b) => a.level - b.level);

      // --- このフレームに使われなかったタイルを解放 ---
      for (const [key, tile] of cache) {
        if (tile.lastUsed < frame) disposeTile(key, tile);
      }

      // --- 描画 ---
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(uViewCenter, centerX, centerZ);
      gl.uniform2f(uHalfSpan, halfX, halfY);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(uMap, 0);
      for (const tile of visible) {
        gl.uniform2f(uTileOrigin, tile.ox, tile.oz);
        gl.uniform1f(uTileSize, tile.tileWorld);
        gl.bindTexture(gl.TEXTURE_2D, tile.texture);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.bindVertexArray(null);

      if (hud) hud.textContent = `lv: ${level} | tiles: ${cache.size}`;
    },
    worldAt(screenX, screenY) {
      const { x, z } = screenToWorld(
        { centerX, centerZ, viewHeight },
        screenX,
        screenY,
        canvas.clientWidth,
        canvas.clientHeight,
      );
      return { x, z, height: height(x, z) };
    },
    worldPerPixel() {
      // 真上ビューなので一様（pan の worldPerPx と同じ）。
      return viewHeight / canvas.clientHeight;
    },
    setHeight(next) {
      height = next;
      // 既存タイルは古い高さ関数で焼かれているので破棄。次フレームで生成し直す。
      for (const [key, tile] of cache) disposeTile(key, tile);
    },
    resetView() {
      centerX = 0;
      centerZ = 0;
      viewHeight = DEFAULT_VIEW_HEIGHT;
    },
    resetNorth() {
      // 2D は常に北が上・真上ビュー。向きの概念がないので何もしない。
    },
    getHeading() {
      return 0;
    },
    isSettled() {
      return settled;
    },
    dispose() {
      detachGestures();
      for (const [key, tile] of cache) disposeTile(key, tile);
      gl.deleteProgram(program);
      gl.deleteVertexArray(vao);
      if (hud) hud.textContent = "";
    },
  };
}
