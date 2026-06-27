import { FBM } from "./noise/fbm";
import { PerlinNoise } from "./noise/perlin-noise";
import { MAX_HEIGHT } from "../core/colormap";

/**
 * ハイトマップの高さ関数の型。
 *   - 引数 x, z はワールド座標（任意の範囲。負も可）。
 *   - 戻り値 y は 0〜MAX_HEIGHT（= 128, 64 が水面の高さ）で返すこと。
 */
export type HeightMapFunc = (x: number, z: number) => number;

/**
 * 各 makeXxxHeightMapFunc は、ノイズなどの初期化を済ませてから
 * 高さ関数（クロージャ）を返す。生成した関数を使い回せばよい。
 *
 * ===== 自分のノイズ実装を試すときはここに make 関数を足す =====
 */

/**
 * 動作確認用の仮実装（中央が高い島）。初期化する状態は持たない。
 */
export function makeIslandHeightMapFunc(): HeightMapFunc {
  return (x, z) => {
    const cx = x;
    const cz = z;
    const dist = Math.sqrt(cx * cx + cz * cz) / 70; // 中心 0 → 端 ~1
    const island = 1 - dist;
    const ripple = Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.08;
    const v = Math.max(0, Math.min(1, island + ripple));
    return v * MAX_HEIGHT;
  };
}

/**
 * 単一 Perlin ノイズによる高さ関数。
 */
export function makePerlinHeightMapFunc({
  seed,
  zoom = 20,
}: {
  seed?: number;
  zoom?: number;
} = {}): HeightMapFunc {
  const noise = new PerlinNoise({ seed });
  return (x, z) => {
    const value = noise.get({ x: x / zoom, y: z / zoom });
    return value * MAX_HEIGHT;
  };
}

/**
 * fBm（複数オクターブの Perlin）による高さ関数。
 */
export function makeFbmHeightMapFunc({
  seed,
  octaves = 8,
  lacunarity = 2,
  gain = 0.5,
  zoom = 20,
}: {
  seed?: number;
  octaves?: number;
  lacunarity?: number;
  gain?: number;
  zoom?: number;
} = {}): HeightMapFunc {
  const noise = new FBM({ seed, octaves, lacunarity, gain });
  return (x, z) => {
    const value = noise.get({ x: x / zoom, y: z / zoom });
    return value * MAX_HEIGHT;
  };
}
