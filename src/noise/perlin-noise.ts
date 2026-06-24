import { diff2d, dot2d, Vector2D } from "../math/vector2d";
import {
  HashFunction,
  makeHashingHashFunction,
  makeSeed,
} from "./hash-function";
import { easeSmootherstep, EasingFunction, interpolate } from "./interpolation";

function crop(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class PerlinNoise {
  private hashFunction: HashFunction;
  private fadeFunction: EasingFunction;

  constructor({
    seed = makeSeed(),
  }: {
    seed?: number;
  } = {}) {
    //this.hashFunction = makePermutationHashFunction(seed);
    //this.hashFunction = makeRngHashFunction(seed);
    this.hashFunction = makeHashingHashFunction(seed);
    //this.fadeFunction = easeLinear;
    //this.fadeFunction = easeSmoothstep;
    this.fadeFunction = easeSmootherstep;
  }

  /**
   * @param pos [Vector2D] 位置ベクトル
   * @returns [number] 正規化された Perlin ノイズの値
   */
  get(pos: Vector2D): number {
    // 格子のバウンディングボックス
    const lattice0: Vector2D = { x: Math.floor(pos.x), y: Math.floor(pos.y) };
    const lattice1: Vector2D = { x: lattice0.x + 1, y: lattice0.y + 1 };

    // 格子の各頂点の位置ベクトル
    const lattice00: Vector2D = { x: lattice0.x, y: lattice0.y };
    const lattice01: Vector2D = { x: lattice0.x, y: lattice1.y };
    const lattice10: Vector2D = { x: lattice1.x, y: lattice0.y };
    const lattice11: Vector2D = { x: lattice1.x, y: lattice1.y };

    // 格子の各頂点における勾配ベクトル
    const grad00 = this.grad(lattice00);
    const grad01 = this.grad(lattice01);
    const grad10 = this.grad(lattice10);
    const grad11 = this.grad(lattice11);

    // 格子の各頂点から対象座標までの距離ベクトル
    const dist00 = diff2d(pos, lattice00);
    const dist01 = diff2d(pos, lattice01);
    const dist10 = diff2d(pos, lattice10);
    const dist11 = diff2d(pos, lattice11);

    // 格子の各頂点における勾配ベクトルと対象座標までの距離ベクトルの内積を求める
    const value00 = dot2d(grad00, dist00);
    const value01 = dot2d(grad01, dist01);
    const value10 = dot2d(grad10, dist10);
    const value11 = dot2d(grad11, dist11);

    // それぞれの頂点における値を補間する
    //
    // 方針としては格子内における対象座標のローカル座標を求め、
    // そのxを横方向、yを縦方向の補間関数のパラメータtとして使用する。
    // value00/value01間およびvalue10/value11間をyを使って補間し、
    // その2つの結果をさらにxを使って補間する。
    // ようは双線形補間にイージング曲線を取り入れたもの。
    //
    //          value00---------value10
    //            |                 |
    //            |  value          |
    //  value0001 +    .            + value1011
    //            | pos(x,y)        |
    //            |                 |
    //          value01---------value11
    //
    const fade = this.fadeFunction;
    const localPos = diff2d(pos, lattice0); // 格子内のローカル座標
    const tx = localPos.x; // x軸方向の補間パラメータ[0,1]
    const ty = localPos.y; // y軸方向の補間パラメータ[0,1]
    const value0001 = interpolate(value00, value01, ty, fade); // y軸方向に補間
    const value1011 = interpolate(value10, value11, ty, fade); // y軸方向に補間
    const value = interpolate(value0001, value1011, tx, fade); // x軸方向に補間

    // 域値を[0,1]に正規化する
    const normalizedValue = this.normalize(value);

    return normalizedValue;
  }

  /**
   * 勾配ベクトル
   * @param pos [Vector2D] 位置ベクトル
   * @returns [Vector2D] 勾配ベクトル
   */
  private grad(pos: Vector2D): Vector2D {
    const v = this.hashFunction(pos);
    const rad = 2 * Math.PI * v;
    return { x: Math.cos(rad), y: Math.sin(rad) };
  }

  /**
   * Perlin ノイズの値域は [-1, 1] ではなく約 [-√(n/4), √(n/4)]（n は次元数）。
   * 2次元なら √(2/4) = √0.5 ≈ 0.707。これを [0, 1] に正規化する。
   * この境界は緩めの上界なので、実データは 0.5 付近に寄り、crop は保険として効く。
   * @param value [number] 対象の値
   * @returns [number] 正規化後の値
   * @see: https://digitalfreepen.com/2017/06/20/range-perlin-noise.html
   */
  private normalize(value: number): number {
    const n = 2;
    const bound = Math.sqrt(n / 4);
    return crop((value + bound) / (2 * bound), 0, 1);
  }
}
