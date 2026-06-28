import { Rng } from "../../core/math/rng";
import type { Vector2D } from "../../core/math/vector2d";

export function makeSeed(rand: number = Math.random()): number {
  return Math.floor(rand * 1_0000_0000);
}

/**
 * 座標から乱数を引く関数
 * いわゆる Counter-based PRNG で次の要件を満たす必要がある
 * - 同じ座標と同じ seed なら同じ値を返す
 */
export type HashFunction = (pos: Vector2D) => number;

/**
 * Perlin noise の説明でよくある実装(オリジナルの論文ではハードコードしてる)
 */
export function makePermutationHashFunction(
  seed: number = makeSeed(),
): HashFunction {
  const permutation = new Array(512);
  const rand = new Rng(seed);

  for (let i = 0; i < 256; i++) {
    permutation[i] = rand.int(0, 255);
    permutation[256 + i] = permutation[i];
  }

  const p = permutation;
  const abs = Math.abs;
  const floor = Math.floor;

  return (pos: Vector2D): number => {
    const v = p[(floor(abs(pos.x)) % 255) + p[floor(abs(pos.y)) % 255]];
    return v / 255;
  };
}

/**
 * seedと座標をXORしたのを普通の疑似乱数生成機のseedとして最初の値を返すだけの雑な実装。こんなんでも要件は満たせる
 */
export function makeRngHashFunction(seed: number = makeSeed()): HashFunction {
  return (pos: Vector2D): number => {
    const x = Math.round(pos.x * 1000);
    const y = Math.round(pos.y * 1000);
    const rng = new Rng(seed ^ x ^ y);
    return rng.next();
  };
}

/**
 * permutation 表を使わず、整数ハッシュで `(x, y, seed) → [0, 1)` を求める実装。
 *
 * 「乗算 + XOR シフト」で座標と seed を撹拌する（Rng の mulberry32 と同系統）。
 * permutation 版と違い 256 周期でラップしないため、負を含む任意の座標を扱える。
 *
 * @param seed [number] シード値。同一 seed なら同一の結果を返す。
 * @returns [HashFunction] 位置ベクトルから値を返す関数
 */
export function makeHashingHashFunction(
  seed: number = makeSeed(),
): HashFunction {
  return (pos: Vector2D): number => {
    const x = Math.round(pos.x * 1000);
    const y = Math.round(pos.y * 1000);

    let h = seed >>> 0;
    h = Math.imul(h ^ x, 0x27d4eb2d);
    h = Math.imul(h ^ y, 0x165667b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;

    return (h >>> 0) / 0x1_0000_0000; // [0, 1)
  };
}
