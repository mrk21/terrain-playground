# Terrain Playground

地形生成アルゴリズムの実験場。アルゴリズムを実装しながら、生成結果を即座に見て確かめることを目的にしている。2D/3Dビュー、無限スクロール、LODによる高速描画等を備え、PC/モバイルブラウザで動作する。

## 技術スタック

- TypeScript: `6.x`
- Vite: `8.x`
- Vitest: `4.x`
- Biome: `2.x`
  - linter / formatter（設定は `biome.json`）
- WebGL2
  - 地形メッシュ・タイルの描画基盤

## セットアップ

```sh
npm install
npm run dev
open http://localhost:5173
```

## 使用方法

起動すると地形が表示される。上部のタブでアルゴリズムを、下部のタブで表示モードを切り替えられる。

- **地形3D**（デフォルト）: ハイトマップを地形メッシュとして立体表示。
  - ドラッグでパン / ホイールでズーム / Shift+ドラッグで回転。
- **地形2D**: ハイトマップを真上から色で表示（Google Maps 風のタイル LOD）。
  - ドラッグでパン / ホイールでズーム。

また、右上の設定アイコンをクリックすると、各種パラメータを変更できる。

## 開発方法

### 開発コマンド

```sh
# 開発サーバ起動（http://localhost:5173）
npm run dev

# LAN 内の他端末からアクセス可能にする場合
npm run dev -- --host 0.0.0.0

# 型チェック (tsc --noEmit) + 本番ビルド (dist/)
npm run build

# ビルド成果物をローカルで確認
npm run preview

# テスト（watch モード）
npm test

# テストを 1 回だけ実行
npm run test:run

# フォーマット（Biome で整形して上書き）
npm run format

# Lint（Biome で静的解析）
npm run lint

# フォーマット + Lint + import 整理をまとめて適用
npm run check
```

### ディレクトリ構成

`src/` は「誰が書く層か」を境界にして 3 つに分けている。

```
src/
├── algorithm/      # 地形生成アルゴリズム（人間が研究・実装する層）
│   ├── noise/      #   Perlin / fBm などのノイズ実装
│   ├── height.ts   #   高さ関数 HeightMapFunc = (x, z) => y の実装
│   └── generators.ts  # ジェネレータ（パラメータ定義 + ファクトリ）のレジストリ
├── visualization/  # 描画・UI（メッシュ生成・レンダリング・操作。AI 生成で広げる層）
│   ├── scenes/     #   2D/3D シーンと LOD
│   ├── gl/         #   WebGL2 ラッパ
│   ├── ui/         #   タブ・パラメータパネル・カメラ操作
│   ├── input/      #   ジェスチャ入力
│   └── shaders/    #   GLSL シェーダ
├── core/           # 両層が依存する基盤
│   ├── math/       #   行列・ベクトル・乱数などの数学 util
│   └── colormap.ts #   共有ドメイン定数を含む colormap
└── main.ts         # 上記を配線するエントリーポイント
```

依存方向は `visualization → algorithm → core` の一方向で、`algorithm` は `visualization` に依存しない。

**新しい地形アルゴリズムを足すとき**は `algorithm/` だけ触ればよい:

1. `algorithm/height.ts` に `makeXxxHeightMapFunc()`（`HeightMapFunc` を返す）を書く。
2. `algorithm/generators.ts` の `GENERATORS` に 1 エントリ（id・ラベル・パラメータ定義・`make()`）を追加する。

UI（タブ・スライダー）は `GENERATORS` の定義から自動で組み立てられるので、描画・UI 側のコードを書く必要はない。
