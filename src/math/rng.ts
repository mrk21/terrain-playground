/**
 * シード値を指定できる擬似乱数生成器（PRNG）。
 *
 * アルゴリズムは mulberry32（32bit 状態の高速な生成器。品質も十分）。
 * 同じシードからは必ず同じ乱数列が得られる（再現性あり）ので、
 * ノイズ生成やプロシージャル生成に向く。
 *
 * @example
 * const rng = new Rng(12345)        // 数値シード
 * const rng2 = new Rng('my-seed')   // 文字列シードも可
 * rng.next()           // 0 以上 1 未満の小数
 * rng.int(0, 255)      // 0〜255 の整数（両端含む）
 * rng.shuffle(arr)     // 配列をシャッフル（Perlin の置換表づくりに便利）
 */
export class Rng {
  /** 内部状態（32bit 符号なし整数として扱う）。 */
  private state: number

  /**
   * @param seed 数値または文字列。省略時は Math.random() 由来の非決定的なシード。
   */
  constructor(seed: number | string = Math.random() * 0x100000000) {
    this.state = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0
  }

  /** 次の乱数を [0, 1) の小数で返す。 */
  next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }

  /** [min, max) の小数を返す。 */
  float(min = 0, max = 1): number {
    return min + this.next() * (max - min)
  }

  /** [min, max] の整数を返す（両端を含む）。 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** 確率 p（0〜1）で true を返す。 */
  bool(p = 0.5): boolean {
    return this.next() < p
  }

  /** 配列からランダムに 1 要素を返す。 */
  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)]
  }

  /** 配列を破壊的にシャッフルして返す（Fisher–Yates）。 */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i)
      const tmp = items[i]
      items[i] = items[j]
      items[j] = tmp
    }
    return items
  }
}

/** 文字列を 32bit 符号なし整数のシードへ変換する（FNV-1a ハッシュ）。 */
export function hashSeed(str: string): number {
  let h = 0x811c9dc5 // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) // FNV prime
  }
  return h >>> 0
}
