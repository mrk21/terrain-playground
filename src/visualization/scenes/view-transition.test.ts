import { describe, expect, it } from "vitest";
import {
  createResetAnimator,
  easeInOutCubic,
  sampleTransition,
  shortestAngleDelta,
} from "./view-transition";

describe("easeInOutCubic", () => {
  it("両端は 0/1 に固定される", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("中央は 0.5（S 字の対称点）", () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });

  it("t と 1-t が点対称（f(t)+f(1-t)=1）", () => {
    for (const t of [0.1, 0.25, 0.4]) {
      expect(easeInOutCubic(t) + easeInOutCubic(1 - t)).toBeCloseTo(1);
    }
  });

  it("序盤はゆっくり（線形より下）", () => {
    // ease-in なので開始直後は t 本来の進みより遅い。
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
  });
});

describe("shortestAngleDelta", () => {
  it("同方向の差はそのまま", () => {
    expect(shortestAngleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(shortestAngleDelta(0, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
  });

  it("±π の境界を跨ぐときは最短回り（符号が反転）", () => {
    // 0.1 → 2π-0.1 は「+ほぼ一周」ではなく「-0.2 の最短側」。
    expect(shortestAngleDelta(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(-0.2);
  });

  it("yaw が何周も回って大きくても ±π 以内の最短側を返す", () => {
    const d = shortestAngleDelta(20, 0);
    expect(Math.abs(d)).toBeLessThanOrEqual(Math.PI);
    // 20 は 6π(≈18.85) より少し大きい → 0 へは正方向に約 0.575 戻すのが最短。
    expect((20 + d) % (2 * Math.PI)).toBeCloseTo(0);
  });
});

describe("sampleTransition", () => {
  const channels = {
    ang: "angle",
    lin: "linear",
    zoom: "log",
  } as const;
  const from = { ang: 0, lin: 10, zoom: 200 };
  const to = { ang: Math.PI / 2, lin: 20, zoom: 2 };

  it("progress=0 で from（各チャンネルとも始点）", () => {
    const p = sampleTransition(from, to, channels, 0);
    expect(p.ang).toBeCloseTo(0);
    expect(p.lin).toBeCloseTo(10);
    expect(p.zoom).toBeCloseTo(200);
  });

  it("progress=1 で to（各チャンネルとも終点）", () => {
    const p = sampleTransition(from, to, channels, 1);
    expect(p.ang).toBeCloseTo(Math.PI / 2);
    expect(p.lin).toBeCloseTo(20);
    expect(p.zoom).toBeCloseTo(2);
  });

  it("中央（eased 0.5）は線形＝中点・対数＝幾何平均", () => {
    const p = sampleTransition(from, to, channels, 0.5);
    expect(p.lin).toBeCloseTo(15); // (10+20)/2
    expect(p.zoom).toBeCloseTo(20); // sqrt(200*2)=20（等速ズーム）
  });

  it("progress は [0,1] に丸める（範囲外でも飛ばない）", () => {
    expect(sampleTransition(from, to, channels, -5).lin).toBeCloseTo(10);
    expect(sampleTransition(from, to, channels, 5).lin).toBeCloseTo(20);
  });

  it("角度は最短回りで補間する（一周しない）", () => {
    // 0.1 → 2π-0.1 は -0.2 の最短側。progress=1 で始点-0.2 近傍に着く。
    const wrap = sampleTransition(
      { a: 0.1 },
      { a: 2 * Math.PI - 0.1 },
      { a: "angle" } as const,
      1,
    );
    expect(wrap.a).toBeCloseTo(0.1 - 0.2);
  });
});

describe("createResetAnimator", () => {
  const channels = { v: "linear" } as const;
  const make = () => createResetAnimator<"v">(channels, 0.4);

  it("開始前は非アクティブで sample は null", () => {
    const anim = make();
    expect(anim.active()).toBe(false);
    expect(anim.sample(0)).toBeNull();
  });

  it("start 後、最初の sample の時刻が開始基準になる（その時点は from）", () => {
    const anim = make();
    anim.start({ v: 0 }, { v: 100 });
    expect(anim.active()).toBe(true);
    // 最初の sample を now=10 で呼ぶ → そこが起点。from を返す。
    expect(anim.sample(10)?.v).toBeCloseTo(0);
    // 起点+半分の時刻 → eased 0.5 で中点。
    expect(anim.sample(10 + 0.2)?.v).toBeCloseTo(50);
  });

  it("進捗 1 に達したら to を返し、以後は自動で解除される", () => {
    const anim = make();
    anim.start({ v: 0 }, { v: 100 });
    anim.sample(0); // 起点=0
    expect(anim.sample(0.4)?.v).toBeCloseTo(100); // ちょうど終端
    expect(anim.active()).toBe(false);
    expect(anim.sample(0.5)).toBeNull();
  });

  it("cancel で即座に停止し null を返す", () => {
    const anim = make();
    anim.start({ v: 0 }, { v: 100 });
    anim.sample(0);
    anim.cancel();
    expect(anim.active()).toBe(false);
    expect(anim.sample(0.2)).toBeNull();
  });
});
