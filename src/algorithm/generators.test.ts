import { describe, expect, it } from "vitest";
import { type ParamDef, parseParamValue } from "./generators";

// 実際のジェネレータで使う定義に近いフィクスチャ。
const OCTAVES: ParamDef = {
  key: "octaves",
  label: "octaves",
  min: 1,
  max: 12,
  step: 1,
  default: 8,
  kind: "int",
};
const LACUNARITY: ParamDef = {
  key: "lacunarity",
  label: "lacunarity",
  min: 1,
  max: 4,
  step: 0.1,
  default: 2,
  kind: "range",
};
const GAIN: ParamDef = {
  key: "gain",
  label: "gain",
  min: 0.1,
  max: 0.9,
  step: 0.05,
  default: 0.5,
  kind: "range",
};
const SEED: ParamDef = {
  key: "seed",
  label: "seed",
  min: 0,
  max: 99_999_999,
  step: 1,
  default: 0,
  kind: "seed",
};

describe("parseParamValue", () => {
  it("範囲内・グリッド上の値はそのまま返す", () => {
    expect(parseParamValue("8", OCTAVES)).toBe(8);
    expect(parseParamValue("2.4", LACUNARITY)).toBe(2.4);
    expect(parseParamValue("0.5", GAIN)).toBe(0.5);
  });

  it("数値として解釈できない文字列は null（呼び出し側は現在値を保つ）", () => {
    expect(parseParamValue("abc", LACUNARITY)).toBeNull();
    expect(parseParamValue("", LACUNARITY)).toBeNull();
    expect(parseParamValue("  ", LACUNARITY)).toBeNull();
  });

  it("下限より小さい値は下限にクランプする", () => {
    expect(parseParamValue("0", OCTAVES)).toBe(1);
    expect(parseParamValue("-5", OCTAVES)).toBe(1);
    expect(parseParamValue("0.05", GAIN)).toBe(0.1);
  });

  it("上限より大きい値は上限にクランプする", () => {
    expect(parseParamValue("99", OCTAVES)).toBe(12);
    expect(parseParamValue("100", LACUNARITY)).toBe(4);
    expect(parseParamValue("5", GAIN)).toBe(0.9);
  });

  it("step グリッド上の最も近い値へスナップする", () => {
    expect(parseParamValue("2.34", LACUNARITY)).toBe(2.3);
    expect(parseParamValue("2.36", LACUNARITY)).toBe(2.4);
    expect(parseParamValue("0.53", GAIN)).toBe(0.55);
    expect(parseParamValue("0.52", GAIN)).toBe(0.5);
  });

  it("スナップ後の端数誤差を丸める（0.1 刻みでも桁が暴れない）", () => {
    // (2.35 - 1) / 0.1 の丸め → *0.1 は素朴だと 2.4000000000000004 になる。
    expect(parseParamValue("2.35", LACUNARITY)).toBe(2.4);
  });

  it("整数パラメータは小数入力を整数へスナップする", () => {
    expect(parseParamValue("8.7", OCTAVES)).toBe(9);
    expect(parseParamValue("8.2", OCTAVES)).toBe(8);
  });

  it("seed も整数へスナップしつつ範囲内はそのまま返す", () => {
    expect(parseParamValue("12345678", SEED)).toBe(12_345_678);
    expect(parseParamValue("42.9", SEED)).toBe(43);
  });
});
