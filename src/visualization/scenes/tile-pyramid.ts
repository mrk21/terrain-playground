/**
 * Google Maps 風のタイルピラミッド（クアッドツリー）LOD の管理。真上ビュー（2D）で
 * 地形を「1テクセル≒1ピクセル」の解像度で覆うタイル群を、生成・選択・キャッシュ・退避する。
 *
 *   - ズームに応じて適切なレベル（＝タイルの細かさ）を選ぶ。拡大すると深いレベル＝
 *     小さいタイルに切り替わり、height() を高解像度でサンプリングし直すので、拡大コピー
 *     のようにガビガビにならず常にくっきり。
 *   - 現在レベルの未生成タイルは 1 フレームに予算ぶんだけ近い順に焼く（カクつき防止）。
 *   - 読み込み中は数段粗いレベルのタイルを下敷きに残して描くので、穴が開かない。
 *   - このフレームに使われなかったタイルは解放する。
 *
 * 描画ループ（scene）からは update() を毎フレーム呼ぶ。GL のシェーダ/uniform/描画コールは
 * scene が持ち、ここはタイルのテクスチャ群と可変状態（cache/frame）だけを所有する。
 */
import type { HeightMapFunc } from "../../algorithm/height";
import { bakeTileTexture } from "./tile-bake";
import { selectTileLevel, tileVisible, viewAabbHalfExtents } from "./tile-lod";

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

interface Tile {
  level: number;
  ox: number;
  oz: number;
  tileWorld: number;
  texture: WebGLTexture;
  lastUsed: number;
}

/** 描画に要る 1 タイルぶんの情報（scene が uniform に流してドローする）。 */
export interface VisibleTile {
  ox: number;
  oz: number;
  tileWorld: number;
  texture: WebGLTexture;
}

/** このフレームの可視タイル選択に要るビュー状態。 */
export interface PyramidView {
  centerX: number;
  centerZ: number;
  /** 垂直方向に映すワールド長（ズーム）。 */
  viewHeight: number;
  /** 描画バッファの縦解像度（レベル選択に使う）。 */
  drawingBufferHeight: number;
  /** ビューのアスペクト比（幅/高さ）。可視範囲の横幅算出に使う。 */
  aspect: number;
  /** 地図の回転角（ラジアン）。回転時は可視範囲を外接 AABB まで広げる。省略時 0。 */
  heading?: number;
}

/** このフレームの描画結果：選んだレベルと、粗→細の順に並べた可視タイル。 */
export interface PyramidFrame {
  /** 選ばれた現在レベル（HUD 表示用）。 */
  level: number;
  /** 描画すべきタイル（粗いレベルが先＝下敷き、細かいレベルが後＝上）。 */
  visible: VisibleTile[];
}

/** タイルピラミッド LOD の管理。scene から毎フレーム update() を呼ぶ。 */
export interface TilePyramid {
  /** 現在のキャッシュ保持タイル数（HUD 表示用）。 */
  readonly size: number;
  /** キャッシュを更新（未生成を予算内で焼き、視界外を解放）して可視タイルを返す。 */
  update(view: PyramidView): PyramidFrame;
  /** 現レベルの可視タイルが欠けていない（＝くっきり描けている）か。 */
  settled(): boolean;
  /** 高さ関数を差し替える（既存タイルを破棄し、次フレームで焼き直す）。 */
  setHeight(next: HeightMapFunc): void;
  /** 全タイルを解放する。 */
  dispose(): void;
}

/** 可視範囲（＋パン先読みマージン）のワールド矩形。 */
interface Bounds {
  ax0: number;
  ax1: number;
  az0: number;
  az1: number;
}

export function createTilePyramid(
  gl: WebGL2RenderingContext,
  heightFunc: HeightMapFunc,
): TilePyramid {
  // 高さ関数は setHeight() で差し替えられる。タイルはこの関数でサンプリングする。
  let height = heightFunc;

  // タイルキャッシュ。キーは `${level},${cx},${cz}`。
  const cache = new Map<string, Tile>();
  let frame = 0;
  // 現レベルの可視タイルが欠けていない（＝くっきり描けている）か。
  let allPresent = false;

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

  const disposeTile = (key: string, tile: Tile): void => {
    gl.deleteTexture(tile.texture);
    cache.delete(key);
  };

  // 現在レベルの可視タイルのうち未生成のものを、近い順に予算ぶんだけ焼く。
  // 生成済みは使用印（lastUsed）を更新する。全部揃っていれば true（収束）を返す。
  const generateMissing = (
    level: number,
    tileWorld: number,
    b: Bounds,
    centerX: number,
    centerZ: number,
  ): boolean => {
    const cxMin = Math.floor(b.ax0 / tileWorld);
    const cxMax = Math.floor(b.ax1 / tileWorld);
    const czMin = Math.floor(b.az0 / tileWorld);
    const czMax = Math.floor(b.az1 / tileWorld);
    const missing: { cx: number; cz: number; d2: number }[] = [];
    for (let cz = czMin; cz <= czMax; cz++) {
      for (let cx = cxMin; cx <= cxMax; cx++) {
        const t = cache.get(`${level},${cx},${cz}`);
        if (t) {
          t.lastUsed = frame;
          continue;
        }
        const tcx = (cx + 0.5) * tileWorld;
        const tcz = (cz + 0.5) * tileWorld;
        missing.push({
          cx,
          cz,
          d2: (tcx - centerX) ** 2 + (tcz - centerZ) ** 2,
        });
      }
    }
    if (missing.length === 0) return true;
    missing.sort((a, c) => a.d2 - c.d2);
    const n = Math.min(missing.length, BUDGET_PER_FRAME);
    for (let i = 0; i < n; i++) {
      const m = missing[i];
      cache.set(`${level},${m.cx},${m.cz}`, createTile(level, m.cx, m.cz));
    }
    return false;
  };

  // 可視 ∩ [level-KEEP_COARSER, level] のタイルを集め、粗い順（下敷きが先）に並べる。
  const collectVisible = (level: number, b: Bounds): VisibleTile[] => {
    const tiles: Tile[] = [];
    for (const tile of cache.values()) {
      if (tile.level > level || tile.level < level - KEEP_COARSER) continue;
      if (
        !tileVisible(
          tile.ox,
          tile.oz,
          tile.tileWorld,
          b.ax0,
          b.ax1,
          b.az0,
          b.az1,
        )
      )
        continue; // 可視範囲外
      tile.lastUsed = frame;
      tiles.push(tile);
    }
    // 粗いレベルを下、細かいレベルを上に重ね描き（読み込み中は粗いタイルが透けて見える）。
    tiles.sort((a, c) => a.level - c.level);
    return tiles;
  };

  // このフレームに使われなかったタイルを解放する。
  const evictUnused = (): void => {
    for (const [key, tile] of cache) {
      if (tile.lastUsed < frame) disposeTile(key, tile);
    }
  };

  return {
    get size() {
      return cache.size;
    },
    update(view) {
      frame++;
      const halfY = view.viewHeight / 2;
      const halfX = halfY * view.aspect;

      // 1テクセル≒1ピクセルになるレベルと、そのタイルのワールド長。
      const level = selectTileLevel(
        view.viewHeight,
        view.drawingBufferHeight,
        BASE_TILE_WORLD,
        TILE_RES,
        MAX_LEVEL,
      );
      const tileWorld = BASE_TILE_WORLD / 2 ** level;

      // 回転していると表示矩形は傾くので、外接する軸並行 AABB で可視範囲を取る
      // （heading=0 なら halfX,halfY のまま）。角のぶん余分に焼くが穴は開かない。
      const aabb = viewAabbHalfExtents(halfX, halfY, view.heading ?? 0);
      const margin = TILE_MARGIN * tileWorld;
      const b: Bounds = {
        ax0: view.centerX - aabb.halfX - margin,
        ax1: view.centerX + aabb.halfX + margin,
        az0: view.centerZ - aabb.halfZ - margin,
        az1: view.centerZ + aabb.halfZ + margin,
      };

      allPresent = generateMissing(
        level,
        tileWorld,
        b,
        view.centerX,
        view.centerZ,
      );
      const visible = collectVisible(level, b);
      evictUnused();
      return { level, visible };
    },
    settled() {
      return allPresent;
    },
    setHeight(next) {
      height = next;
      // 既存タイルは古い高さ関数で焼かれているので破棄。次フレームで生成し直す。
      for (const [key, tile] of cache) disposeTile(key, tile);
    },
    dispose() {
      for (const [key, tile] of cache) disposeTile(key, tile);
    },
  };
}
