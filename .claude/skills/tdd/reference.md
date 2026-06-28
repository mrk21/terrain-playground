# tdd — このプロジェクトでの TDD 規約

SKILL.md のサイクルを、terrain-playground の実体（vitest 4 + Biome + TypeScript）に合わせて具体化したもの。

## コマンド

| 目的                     | コマンド                | 備考                                            |
| ------------------------ | ----------------------- | ----------------------------------------------- |
| テスト（watch）          | `npm test`              | `vitest`。開発中ずっと回しておく用              |
| テスト（単発）           | `npm run test:run`      | `vitest run`。各フェーズの検証はこれを使う      |
| 型チェック               | `npx tsc --noEmit`      | `npm run build` も型チェック込みだが本番ビルドまで走る |
| lint + format            | `npm run check`         | `biome check --write .`。**自動修正される**     |

`npm run lint`（検査のみ）/ `npm run format`（整形のみ）もあるが、完了ゲートでは `npm run check` 一本でよい。

## テストの書き方

`vitest.config.ts` は `include: ["src/**/*.{test,spec}.ts"]` / `environment: "node"`。これに従う:

- テストファイルは**対象ソースの隣**に `<name>.test.ts` で置く（例: `vector2d.ts` → `vector2d.test.ts`）。
- `import { describe, expect, it } from "vitest"` を使い、対象は相対 import（`import { ... } from "./vector2d"`）。
- **テスト名（`describe` / `it`）は日本語**で、振る舞いを説明する文にする。
- 既存の手本: [src/core/math/rng.test.ts](../../../src/core/math/rng.test.ts)。下のような粒度・文体に揃える。

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "./rng";

describe("Rng", () => {
  it("同じシードからは同じ乱数列が得られる（再現性）", () => {
    // ...
    expect(seqA).toEqual(seqB);
  });

  it("next() は [0, 1) の範囲を返す", () => {
    // ...
  });
});
```

数値計算の比較で浮動小数点誤差が出るときは `toBeCloseTo` を使う。

## テスト可否を分ける軸

テストしやすさは「**純粋関数かどうか**」ではなく「**実行環境（ブラウザ/WebGL/DOM）に依存するか**」で決まる。vitest は `environment: "node"` なので:

- **node でそのままテストできる** = 数値・文字列・プレーンなオブジェクトと標準ライブラリだけで動くコード。`core/math/rng` の `Rng` のように内部状態を持ち厳密には純粋関数でなくても、環境に依存しなければテストできる。
- **そのままでは動かない** = `HTMLCanvasElement`・`WebGL2RenderingContext`・`document`・`PointerEvent`・`DOMRect` などブラウザ固有の API・型に触れるコード。jsdom などのモックを入れない限り node では動かない。たとえ純粋関数でも、`combineDOMRect(...rects: DOMRect[]): DOMRect` のようにブラウザ型を使えばモックが要る。
- 副作用があってもテストはできる（例: ファイルに書き出す関数は純粋ではないが普通にテストする）。純粋関数（同一入力→同一出力・副作用なし）であればテストが一段簡単になる、という補助的な関係にすぎない。

用語注意: このドキュメントで「純粋関数」と書くときは上の厳密な意味（同一入力→同一出力・副作用なし）。「テストできる／切り出す」の判断は純粋性ではなく**環境非依存かどうか**で行う。

## レイヤと抽出方針

このリポジトリは「誰が書く層か」で 3 層に分かれており、テスト可否（＝環境依存の有無）もこの境界とほぼ一致する:

- **`algorithm/`**（`noise/perlin-noise`・`noise/fbm`・`noise/interpolation`・`height` など）: 地形生成アルゴリズムを実験・検証するための層。数値だけで決定的に動き環境に依存しないので直接テストする。境界・範囲・再現性・既知の入力に対する既知の出力を確認する。**可視化・入力由来のロジックの引っ越し先にはしない**（この層はあくまで生成アルゴリズム用）。
- **`core/`**（`math/vector2d`・`math/mat4`・`math/rng`・`colormap`）: どの層からも使える汎用ユーティリティ。環境非依存なので直接テストする。
- **`visualization/`**（`gl/`・`scenes/`・`ui/`・`input/`）: WebGL コンテキスト・DOM・canvas・ポインタイベントに触る。実行環境（ブラウザ）が要るので、ここに直接触る部分はユニットテストしない。

**抽出は程度問題**: `visualization/` の中に計算（クランプ、補間、感度スケーリング、座標/行列の組み立て、ズーム量や回転角の更新ロジック、状態遷移など）が埋まっていることがある。これをテストのために何でも環境非依存へ追い込むと、不自然な型変換や薄い間接層が増えて**設計のほうが歪む**ことがある。テストで得られる価値が抽出のコストを上回るときにだけ切り出す。判断材料:

- 計算に中身があり（分岐・式・境界があり）単体で検証する価値が高い → 切り出す価値が高い。
- もともと数値や素の値だけで動く計算が、たまたまブラウザ寄りのコードに同居しているだけ → 切り出しは自然。素直に出す。
- ブラウザ型（`DOMRect` 等）を受け取っているが、関数が実際に使うのは一部の数値だけ → その数値だけを引数にすれば、無理のない範囲で環境非依存にできる。
- 切り出すと不自然な変換層が要る／ほぼロジックの無い薄いグルー → 無理に出さない。グルーのまま対象外にするか、その箇所だけ jsdom 等のモックを入れてテストする。

切り出すと決めたら:

1. ブラウザ/WebGL/DOM に依存しない関数として出す。行き先は、**汎用的でどこからでも再利用できるものは `core`**、その画面・シーン・入力に固有のものは **`visualization/` 内のヘルパ**（対象ファイルの隣など同階層）。`algorithm/` には入れない。
2. その関数を TDD（RED→GREEN→REFACTOR）する。可能なら状態や時刻に依存させず純粋関数にすると、テストがさらに楽になる。
3. 元の WebGL/DOM 側は、その関数を呼ぶだけの薄いグルーにする。グルーはテスト対象外でよい。

要は「UI だからテストしない」と最初から諦めない一方で、「**テストのために設計を歪めない**」。削り出すのが自然なものを、自然な形で削り出す。

## 複雑度ゲート

「複雑度→設計見直し」の運用方針は CLAUDE.md「複雑度と設計見直し」にある。ここはその技術的背景。

ゲートは Biome の `noExcessiveCognitiveComplexity` で機械化している。`biome.json` で `level: "warn"` / 閾値 `maxAllowedComplexity: 15`（SonarSource の認知的複雑度アルゴリズム）。`npm run check` / `npm run lint` で、超えた関数が `Excessive complexity of N detected (max: 15)` として出る。

測っているのは**読みにくさ**（分岐・ネストの深さ）であって行数ではない。冗長でも直線的なコードは上がらず、深くネストした制御フローで上がる。循環的複雑度（テストの本数の目安）ではなく認知的複雑度なので、「人/AI が追える設計か」を見る用途に向く。素直に書いた純粋ロジックはガード節や「配列＋ループ」になって15に届きにくく、警告が実際に出るのは既存コード（特に `visualization/` 側）への機能追加で制御フローが深くなったとき。

本質的な複雑さで抑制すると判断したときの書式（理由を必ず書く。これ自体が記録になる）:

```ts
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 生成カーネルの分岐は本質的。これ以上分割すると却って追いにくくなる
export function generateHeightField(/* ... */) {
  // ...
}
```

閾値はリポジトリ全体に効く（`visualization/` のグルーも含む）が、認知的複雑度は直線的な WebGL セットアップではほぼ上がらないので実害は出にくい。うるさく感じたら `biome.json` で `maxAllowedComplexity` を上げるか、`overrides` で `src/core`・`src/algorithm` に絞る。

## カバレッジ

既定ではカバレッジ閾値を強制しない（個人プロジェクトで摩擦になるため）。必要なときだけ任意で測る:

```sh
npx vitest run --coverage   # 別途 @vitest/coverage-v8 の追加が必要
```
