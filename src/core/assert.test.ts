import { describe, expect, it } from "vitest";
import { throwOnNullable } from "./assert";

describe("throwOnNullable", () => {
  it("非 null/undefined の値はそのまま返す", () => {
    expect(throwOnNullable(42)).toBe(42);
    expect(throwOnNullable("a")).toBe("a");
    const obj = { x: 1 };
    expect(throwOnNullable(obj)).toBe(obj);
  });

  it("falsy だが非 null な値（0・空文字・false）は弾かずそのまま返す", () => {
    expect(throwOnNullable(0)).toBe(0);
    expect(throwOnNullable("")).toBe("");
    expect(throwOnNullable(false)).toBe(false);
  });

  it("null を渡すと例外を投げる", () => {
    expect(() => throwOnNullable(null)).toThrow();
  });

  it("undefined を渡すと例外を投げる", () => {
    expect(() => throwOnNullable(undefined)).toThrow();
  });

  it("message を渡すとそのメッセージで例外を投げる", () => {
    expect(() => throwOnNullable(null, "#gl が見つかりません。")).toThrow(
      "#gl が見つかりません。",
    );
  });

  it("message を省略すると既定メッセージで例外を投げる", () => {
    expect(() => throwOnNullable(null)).toThrow(
      "値が null または undefined です。",
    );
  });

  it("戻り値型は非 null に絞られる（型引数を明示しても undefined が残らない）", () => {
    // `narrowed: string` への代入が、戻り値が `string | undefined` だと tsc で落ちる。
    // = NonNullable<T> 注釈の回帰防止（実行時の値も併せて確認）。
    const narrowed: string = throwOnNullable<string | undefined>("x");
    expect(narrowed).toBe("x");
  });
});
