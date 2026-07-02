import { describe, expect, it } from "vitest";
import { decayStep, sampleVelocity, twoFingerGesture } from "./gesture-math";

describe("twoFingerGesture", () => {
  it("2 点の重心・間隔・角度を返す（水平に並ぶ場合）", () => {
    const g = twoFingerGesture({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(g.cx).toBe(5);
    expect(g.cy).toBe(0);
    expect(g.dist).toBeCloseTo(10);
    expect(g.angle).toBeCloseTo(0);
  });

  it("角度は a→b 方向で測る（垂直なら π/2）", () => {
    const g = twoFingerGesture({ x: 0, y: 0 }, { x: 0, y: 4 });
    expect(g.dist).toBeCloseTo(4);
    expect(g.angle).toBeCloseTo(Math.PI / 2);
  });

  it("重心は順序に依らない", () => {
    const g1 = twoFingerGesture({ x: 2, y: 6 }, { x: 8, y: 10 });
    const g2 = twoFingerGesture({ x: 8, y: 10 }, { x: 2, y: 6 });
    expect(g1.cx).toBe(g2.cx);
    expect(g1.cy).toBe(g2.cy);
    expect(g1.dist).toBeCloseTo(g2.dist);
  });

  it("2 点が一致したとき dist は 0 でなく 1 に丸める（0 除算回避）", () => {
    const g = twoFingerGesture({ x: 3, y: 3 }, { x: 3, y: 3 });
    expect(g.dist).toBe(1);
    expect(g.cx).toBe(3);
    expect(g.cy).toBe(3);
  });
});

describe("sampleVelocity", () => {
  it("直近ウィンドウ内の等速移動から速度（値/ms）を返す", () => {
    // t=0,16,32 ms に値が 8 ずつ増える。
    const v = sampleVelocity(
      [
        { v: 0, t: 0 },
        { v: 8, t: 16 },
        { v: 16, t: 32 },
      ],
      100,
    );
    expect(v).toBeCloseTo(0.5); // (16-0)/(32-0)
  });

  it("負方向の変化でも符号付きで返す", () => {
    const v = sampleVelocity(
      [
        { v: 0, t: 0 },
        { v: -10, t: 40 },
      ],
      100,
    );
    expect(v).toBeCloseTo(-0.25); // -10/40
  });

  it("ウィンドウより古いサンプルは無視する（動かして止めてから離すと速度 0）", () => {
    // 速く動いた後 200ms 静止して離した想定。最後の静止サンプルだけがウィンドウ内。
    const v = sampleVelocity(
      [
        { v: 0, t: 0 },
        { v: 100, t: 50 },
        { v: 100, t: 250 }, // 離した瞬間（同じ値）
      ],
      80,
    );
    expect(v).toBe(0);
  });

  it("ウィンドウ内に 2 点以上あれば、その区間の平均速度を返す", () => {
    const v = sampleVelocity(
      [
        { v: 0, t: 0 },
        { v: 100, t: 50 },
        { v: 100, t: 60 },
      ],
      100,
    );
    expect(v).toBeCloseTo(100 / 60);
  });

  it("サンプルが 1 つ以下なら速度 0", () => {
    expect(sampleVelocity([], 100)).toBe(0);
    expect(sampleVelocity([{ v: 5, t: 5 }], 100)).toBe(0);
  });

  it("経過時間が 0（同時刻）なら 0 除算せず速度 0", () => {
    const v = sampleVelocity(
      [
        { v: 0, t: 10 },
        { v: 30, t: 10 },
      ],
      100,
    );
    expect(v).toBe(0);
  });
});

describe("decayStep", () => {
  it("速度は exp(-dt/tau) 倍に減衰する", () => {
    const s = decayStep(1, 100, 200);
    expect(s.v).toBeCloseTo(1 * Math.exp(-100 / 200));
  });

  it("このステップの変位は速度の積分 v*tau*(1-exp(-dt/tau))", () => {
    const tau = 200;
    const dt = 100;
    const s = decayStep(-2, dt, tau);
    expect(s.d).toBeCloseTo(-2 * tau * (1 - Math.exp(-dt / tau)));
  });

  it("dt=0 なら変位 0・速度不変", () => {
    const s = decayStep(3, 0, 200);
    expect(s.d).toBe(0);
    expect(s.v).toBe(3);
  });

  it("dt が負なら変位 0・速度不変（時刻の巻き戻りを無視する）", () => {
    // rAF の now と event.timeStamp のずれで dt が一時的に負になりうる。
    // そのとき逆方向に動かしたり速度を増幅させたりしない。
    const s = decayStep(3, -10, 200);
    expect(s.d).toBe(0);
    expect(s.v).toBe(3);
  });

  it("停止までの総変位は v0*tau に収束する（フレームレート非依存）", () => {
    const tau = 250;
    let v = 0.8;
    let sum = 0;
    // 16.6ms/frame で 5 秒ぶん進める（tau=250ms なので十分停止する）。
    for (let i = 0; i < 300; i++) {
      const s = decayStep(v, 16.6, tau);
      sum += s.d;
      v = s.v;
    }
    expect(sum).toBeCloseTo(0.8 * tau, 1);
  });
});
