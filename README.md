# terrain-playground

Vite + TypeScript + 素の WebGL2 による**地形生成（プロシージャル地形）の実験用プロジェクト**。
Perlin ノイズ / fBm でハイトマップを生成し、クアッドツリー LOD で 2D（俯瞰）/ 3D（地形メッシュ）に描画する。
ノイズや高さ関数を差し替えながら、生成結果を即座に見て確かめることを目的にしている。

## セットアップ

```bash
npm install
npm run dev      # 開発サーバ起動（http://localhost:5173）
npm run build    # 型チェック (tsc --noEmit) + 本番ビルド (dist/)
npm run preview  # ビルド成果物をローカルで確認
```

## 使い方

起動すると地形が表示される。画面左上のボタンで表示を切り替えられる。

- **地形3D**（デフォルト）: ハイトマップを地形メッシュとして立体表示。
  - ドラッグでパン / ホイールでズーム / Shift+ドラッグで回転。
- **地形2D**: ハイトマップを真上から色で表示（Google Maps 風のタイル LOD）。
  - ドラッグでパン / ホイールでズーム。

どちらもクアッドツリー LOD なので、ズームしても描画コストはほぼ一定で、拡大しても粗くならない（高さ関数を高解像度で再サンプリングする）。

## ハイトマップの仕組み

高さ関数 `height(x, z): number` がワールド座標から高さ（0〜128, 64 が水面）を返し、色マップが高さを色に変換する。高さ関数・色マップは 2D / 3D で共通。

- **高さ関数**: [src/heightmap/height.ts](src/heightmap/height.ts)
  - `makeIslandHeightMapFunc`（動作確認用の島）/ `makePerlinHeightMapFunc`（単一 Perlin）/ `makeFbmHeightMapFunc`（fBm, デフォルト）を用意。
  - 末尾の `export const height = ...` で使う関数を切り替える。
- **ノイズ実装**: [src/perlin-noise.ts](src/perlin-noise.ts)
  - `PerlinNoise`（勾配ノイズ本体）と `FBM`（複数オクターブの合成）。
  - 格子点のハッシュ関数は permutation 版 / RNG 版 / 整数ハッシュ版を切り替え可能。
- **色マップ**: [src/heightmap/colormap.ts](src/heightmap/colormap.ts)
  - `y < 64`: 青系（深いほど濃い → 浅いほど明るい）、`y >= 64`: 緑 → 焦茶。
  - 水面高さ・最大高さ・各色は上部の定数で調整できる。
- **乱数**: [src/math/rng.ts](src/math/rng.ts) … mulberry32 のシード付き PRNG（同じシードで再現可能）。

`height.ts` を編集して保存すると Vite が自動リロードし、地形が更新される。

## ディレクトリ構成

```
src/
├─ main.ts              エントリ。コンテキスト生成・シーン切替・描画ループ
├─ perlin-noise.ts      Perlin ノイズ / fBm の実装、格子ハッシュ関数
├─ gl/
│  ├─ context.ts        WebGL2 コンテキスト取得 / DPR 対応リサイズ
│  └─ shader.ts         シェーダのコンパイル / プログラムのリンク
├─ math/
│  ├─ mat4.ts           列優先 4x4 行列（透視投影・回転・平行移動など）
│  └─ rng.ts            シード付き擬似乱数（mulberry32）
├─ heightmap/
│  ├─ height.ts         高さ関数 height(x, z)（← ノイズの差し替え口）
│  └─ colormap.ts       高さ → 色 の変換（青系 / 緑〜焦茶）
├─ scenes/
│  ├─ scene.ts          Scene インターフェイス
│  ├─ scene-heightmap3d.ts 地形3D（クアッドツリー LOD メッシュ・マウス操作）
│  └─ scene-heightmap.ts   地形2D（タイルピラミッド LOD の俯瞰）
└─ shaders/             GLSL（`?raw` で文字列としてインポート）
   ├─ terrain.vert / terrain.frag   3D 地形メッシュ用
   ├─ tile.vert / tile.frag         2D タイル用
   ├─ textured.vert                 共通の頂点シェーダ
   └─ heightmap.frag

docs/                   実装メモ
├─ interpolation.md     補間関数（fade / smoothstep）
└─ random-access-prng.md ランダムアクセス可能な疑似乱数（CBRNG / ノイズ関数）
```

## 開発のヒント

- **新しいノイズを試す**: `height.ts` に `makeXxxHeightMapFunc` を足し、末尾の `height` を差し替える（戻り値は 0〜128）。
- **ハッシュ関数を変える**: `perlin-noise.ts` の `PerlinNoise` コンストラクタで、permutation / RNG / 整数ハッシュ版を選ぶ。
- **新しいシーン**: `Scene` を実装するファクトリを作り、`main.ts` の `factories` に登録する。
- 背景となる考え方は [docs/](docs/) にメモを置いている。
