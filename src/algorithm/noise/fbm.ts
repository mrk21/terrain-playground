import { Rng } from "../../core/math/rng";
import type { Vector2D } from "../../core/math/vector2d";
import { makeSeed } from "./hash-function";
import { PerlinNoise } from "./perlin-noise";

function* times(n: number): Generator<number, void, unknown> {
  for (let i = 0; i < n; i++) {
    yield i;
  }
}

/**
 * fBm（Fractal Brownian Motion）
 */
export class FBM {
  private noises: PerlinNoise[];
  private octaves: number;
  private lacunarity: number;
  private gain: number;

  constructor({
    seed = makeSeed(),
    octaves = 4,
    lacunarity = 2,
    gain = 0.5,
  }: {
    seed?: number;
    octaves?: number;
    lacunarity?: number;
    gain?: number;
  } = {}) {
    const seeds = new Rng(seed);

    this.noises = Array.from(times(octaves)).map(
      () => new PerlinNoise({ seed: makeSeed(seeds.next()) }),
    );
    this.octaves = octaves;
    this.lacunarity = lacunarity;
    this.gain = gain;
  }

  get(pos: Vector2D): number {
    let amplitude = 1;
    let frequency = 1;
    let sum = 0;
    let totalAmplitude = 0; // 正規化用：振幅の総和

    for (let i = 0; i < this.octaves; i++) {
      const value = this.noises[i].get({
        x: pos.x * frequency,
        y: pos.y * frequency,
      });
      sum += amplitude * value;
      totalAmplitude += amplitude;
      amplitude *= this.gain;
      frequency *= this.lacunarity;
    }

    // 各 octave が [0,1] なので、振幅の総和で割れば全体も [0,1] に収まる。
    return sum / totalAmplitude;
  }
}
