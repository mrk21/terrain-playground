/**
 * 3D 地形クアッドツリー LOD シーンのチューニング定数。
 * scene-heightmap3d / terrain-tiles / node-mesh が共有する単一の出所。
 */
import { MAX_HEIGHT } from "../../core/colormap";

/** 各ノードのメッシュ解像度（固定）。詳細はノードの世界サイズの分割で出す。 */
export const LEAF_GRID = 64;
/** ノード 1 辺の頂点数（= LEAF_GRID + 1）。 */
export const N = LEAF_GRID + 1;
/** 深さ0（ルート）ノードの一辺のワールド長。深くなるほど半分になる。 */
export const ROOT_SIZE = 4096;
/** 最大分割深さ（= 最小ノードサイズ ROOT_SIZE/2^MAX_DEPTH）。 */
export const MAX_DEPTH = 10;
/** 1 三角形の目標最大サイズ（CSS ピクセル）。小さいほど高精細・多ノード（重い）。 */
export const PIXEL_BUDGET = 2;

/** 垂直方向の誇張スケール。geometry の y のみに掛かる（色は真の高さのまま）。 */
export const HEIGHT_SCALE = 0.2;
/** スカートの深さ（スケール後の y）。地形の全高(≈25.6)より深くして、どんな段差も隠す。 */
export const SKIRT_DEPTH = 32;

/** 注視点の高さ（一定）。地形の中央高さに固定（パン時の縦揺れ防止）。 */
export const TARGET_Y = (MAX_HEIGHT / 2) * HEIGHT_SCALE;

/** カメラ（視点）パラメータ。 */
export const FOV = Math.PI / 4;
export const FAR = 5000;
export const MIN_DISTANCE = 5;
export const MAX_DISTANCE = 1500;
/** 1 フレームに新規生成するノード数（ビルドキューの上位＝手前優先で消化する）。 */
export const BUILD_BUDGET = 16;
/**
 * 視点が速く動いている間（パン/ズーム/回転の慣性中など）の新規生成上限。
 * 滑走中は毎フレーム多数のノードを焼くとカクつくので絞り、粗い親で覆ったまま
 * 滑らせる。止まれば BUILD_BUDGET に戻して細部を焼き直す（動作中は品質を落とす）。
 * 描画に必要なフォールバック（粗い親）は予算外で必ず用意されるので覆いは崩れない。
 */
export const MOVING_BUILD_BUDGET = 4;
/**
 * ノードキャッシュの保持上限（個数）。視界外・別 LOD に外れたノードを即捨てず、
 * この数までは残して LRU で間引く。回転・パン・ズームで戻ったとき、作り直さず
 * 即再利用するため（Google Maps 風に「一度読んだタイルは残す」挙動）。
 * 高解像度ビューポートでの可視ノード数（~300）の上に保持分の余裕を確保する。
 * 注: 描画に必要なノードは lastUsed で必ず保護されるので、この値は「保持量 vs メモリ」
 * のチューニングであって、小さくても描画は壊れない（保持の効きが弱まるだけ）。
 */
export const CACHE_CAPACITY = 512;
/** ルートを探索する範囲（カメラのルートセルから ±ROOT_RADIUS）。 */
export const ROOT_RADIUS = 2;

/** AABB の y 範囲（スカート下端〜地形最大高）。 */
export const BOX_MIN_Y = -SKIRT_DEPTH;
export const BOX_MAX_Y = MAX_HEIGHT * HEIGHT_SCALE;
