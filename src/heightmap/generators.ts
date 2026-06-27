import {
  makeFbmHeightMapFunc,
  makeIslandHeightMapFunc,
  makePerlinHeightMapFunc,
  type HeightMapFunc,
} from "./height";
import { makeSeed } from "../noise/hash-function";

/**
 * ジェネレータ（高さ関数のファクトリ）と、その調整可能なパラメータを
 * まとめたレジストリ。UI（タブ・パラメータパネル）はこの定義から組み立てる。
 *
 * ===== 自分のノイズを足すときは height.ts に make 関数を書き、ここに 1 エントリ追加する =====
 */

/** パラメータ 1 つの定義。UI のコントロールはこの kind で出し分ける。 */
export interface ParamDef {
  /** make() に渡す値のキー。URL クエリのキーにもなる。 */
  key: string;
  /** 表示名。 */
  label: string;
  /** スライダーの下限・上限・刻み。 */
  min: number;
  max: number;
  step: number;
  /** 既定値。 */
  default: number;
  /**
   * 表示の種類。
   *   - "range": 連続値のスライダー
   *   - "int":   整数のスライダー
   *   - "seed":  整数入力 + 🎲（ランダム化）ボタン
   */
  kind: "range" | "int" | "seed";
}

/** 1 つのジェネレータ（タブ 1 枚ぶん）。 */
export interface HeightMapGenerator {
  /** 識別子。URL クエリ（gen=...）にもなる。 */
  id: string;
  /** タブの表示名。 */
  label: string;
  /** 調整可能なパラメータ群（無ければ空配列）。 */
  params: ParamDef[];
  /** パラメータ値から高さ関数を作る。 */
  make(values: Record<string, number>): HeightMapFunc;
}

/** seed は全ノイズ系で共通なので定義を使い回す。既定値は defaultValues() で毎回ランダム生成する。 */
const SEED: ParamDef = {
  key: "seed",
  label: "seed",
  min: 0,
  max: 99_999_999,
  step: 1,
  default: 0, // 未使用（seed は makeSeed() でランダム生成する）。
  kind: "seed",
};

const ZOOM: ParamDef = {
  key: "zoom",
  label: "zoom",
  min: 1,
  max: 200,
  step: 1,
  default: 20,
  kind: "range",
};

export const GENERATORS: HeightMapGenerator[] = [
  {
    id: "island",
    label: "Island",
    params: [],
    make: () => makeIslandHeightMapFunc(),
  },
  {
    id: "perlin",
    label: "Perlin",
    params: [SEED, ZOOM],
    make: ({ seed, zoom }) => makePerlinHeightMapFunc({ seed, zoom }),
  },
  {
    id: "fbm",
    label: "fBm",
    params: [
      SEED,
      ZOOM,
      { key: "octaves", label: "octaves", min: 1, max: 12, step: 1, default: 8, kind: "int" },
      { key: "lacunarity", label: "lacunarity", min: 1, max: 4, step: 0.1, default: 2, kind: "range" },
      { key: "gain", label: "gain", min: 0.1, max: 0.9, step: 0.05, default: 0.5, kind: "range" },
    ],
    make: ({ seed, zoom, octaves, lacunarity, gain }) =>
      makeFbmHeightMapFunc({ seed, zoom, octaves, lacunarity, gain }),
  },
];

/** id からジェネレータを引く（無ければ先頭を返す）。 */
export function generatorById(id: string | null): HeightMapGenerator {
  return GENERATORS.find((g) => g.id === id) ?? GENERATORS[0];
}

/** ジェネレータの既定パラメータ値（key → default）。seed は毎回ランダム生成する。 */
export function defaultValues(gen: HeightMapGenerator): Record<string, number> {
  const values: Record<string, number> = {};
  for (const p of gen.params) {
    values[p.key] = p.kind === "seed" ? makeSeed() : p.default;
  }
  return values;
}
