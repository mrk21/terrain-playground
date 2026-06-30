import { describe, expect, it } from "vitest";
import {
  formatScaleLabel,
  minorDivisions,
  niceScaleBar,
  scaleBottomOffset,
} from "./scale-bar";

describe("niceScaleBar", () => {
  it("ちょうど収まるとき maxBarPx いっぱいに 1/2/5×10^n を選ぶ", () => {
    // worldPerPx=1, maxBarPx=100 → maxWorld=100 → 100(=10^2)
    expect(niceScaleBar(1, 100)).toEqual({
      worldLength: 100,
      pixelLength: 100,
    });
  });

  it("maxWorld が 2×10^n を超えると 2×10^n を選ぶ", () => {
    // worldPerPx=0.25, maxBarPx=100 → maxWorld=25 → 20
    const t = niceScaleBar(0.25, 100);
    expect(t.worldLength).toBe(20);
    expect(t.pixelLength).toBeCloseTo(80); // 20/0.25
  });

  it("maxWorld が 5×10^n を超えると 5×10^n を選ぶ", () => {
    // worldPerPx=1, maxBarPx=60 → maxWorld=60 → 50
    const t = niceScaleBar(1, 60);
    expect(t.worldLength).toBe(50);
    expect(t.pixelLength).toBeCloseTo(50);
  });

  it("深いズーム（worldPerPx<1）では小数のワールド長を選ぶ", () => {
    // worldPerPx=0.001, maxBarPx=100 → maxWorld=0.1 → 0.1
    const t = niceScaleBar(0.001, 100);
    expect(t.worldLength).toBeCloseTo(0.1);
    expect(t.pixelLength).toBeCloseTo(100);
  });

  it("どの倍率でもバーは maxBarPx を超えず、ワールド長は 1/2/5×10^n", () => {
    const mantissas = new Set([1, 2, 5]);
    for (let i = -20; i <= 20; i++) {
      const worldPerPx = 1.3 ** i; // 1 を含まない刻みで広く走査
      const { worldLength, pixelLength } = niceScaleBar(worldPerPx, 100);
      expect(pixelLength).toBeLessThanOrEqual(100 + 1e-9);
      // 仮数（先頭桁）が 1/2/5 のいずれか。
      const exp = Math.round(Math.log10(worldLength));
      const mantissa = Math.round(worldLength / 10 ** exp);
      expect(mantissas.has(mantissa)).toBe(true);
    }
  });
});

describe("formatScaleLabel", () => {
  it("1 以上は整数で表示", () => {
    expect(formatScaleLabel(100)).toBe("100");
    expect(formatScaleLabel(200)).toBe("200");
    expect(formatScaleLabel(20)).toBe("20");
    expect(formatScaleLabel(5000)).toBe("5000");
  });

  it("1 未満は浮動小数の雑音なく小数で表示", () => {
    expect(formatScaleLabel(0.5)).toBe("0.5");
    expect(formatScaleLabel(0.2)).toBe("0.2");
    expect(formatScaleLabel(0.05)).toBe("0.05");
  });
});

describe("scaleBottomOffset", () => {
  it("操作説明と 1 行に収まるなら 0（最下段のまま）", () => {
    // hint 200 + gap 12 + scale 100 = 312 ≤ 600 → 重ならない
    expect(scaleBottomOffset(200, 20, 100, 600, 12)).toBe(0);
  });

  it("1 行に収まらないなら hintHeight + gap だけ持ち上げる", () => {
    // hint 500 + 12 + 100 = 612 > 600 → 操作説明の上へ
    expect(scaleBottomOffset(500, 80, 100, 600, 12)).toBe(92);
  });

  it("合計がちょうど行幅と等しいときは重なり扱いせず 0", () => {
    // 488 + 12 + 100 = 600 == 600
    expect(scaleBottomOffset(488, 80, 100, 600, 12)).toBe(0);
  });
});

describe("minorDivisions", () => {
  it("先頭桁 1 → 5 分割（副目盛りが 2/4/6/8…刻みに落ちる）", () => {
    expect(minorDivisions(10)).toBe(5);
    expect(minorDivisions(100)).toBe(5);
    expect(minorDivisions(1000)).toBe(5);
    expect(minorDivisions(0.1)).toBe(5);
  });

  it("先頭桁 2 → 4 分割（5/10/15…刻みに落ちる）", () => {
    expect(minorDivisions(20)).toBe(4);
    expect(minorDivisions(200)).toBe(4);
    expect(minorDivisions(0.2)).toBe(4);
  });

  it("先頭桁 5 → 5 分割（10/20/30/40…刻みに落ちる）", () => {
    expect(minorDivisions(50)).toBe(5);
    expect(minorDivisions(500)).toBe(5);
    expect(minorDivisions(0.5)).toBe(5);
  });
});
