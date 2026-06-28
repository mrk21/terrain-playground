---
name: visual-check
description: terrain-playground の UI/WebGL 描画を Playwright の視覚回帰で確認・更新するワークフロー。`src/visualization/` のシーン・シェーダ・カメラ/視点の数式など「描画される絵が変わりうる」コードを編集したら、明示的に頼まれなくても積極的に使う。「視覚回帰を回して」「描画が変わってないか確認して」「baseline（基準画像）を更新して」「README のスクショを撮り直して」「screenshot.png を再生成して」などでも起動する。npm run test:e2e の実行・diff 画像の判定・baseline 更新・npm run shot による README 画像の再生成までを扱う。純粋ロジック（`algorithm/`・`core/`）のテストは対象外で、それは tdd スキル。
---

# visual-check

純粋ロジックに抽出しきれない「実際に描画された絵」を、Playwright の視覚回帰（基準画像との差分比較）で守る。`/tdd` と役割分担していて、**数値・計算は `/tdd`（vitest）、描画された見た目はこのスキル**。CLAUDE.md「UI/WebGL の視覚回帰（Playwright）」のルールを実行する手順。

## いつ使うか

- **使う**: `src/visualization/` の**描画される絵に影響しうる**変更のあと。シーン（`scenes/`）・シェーダ（`shaders/`）・カメラ/視点の数式・色（`core/colormap` 経由で見た目が変わる場合）など。「見た目を変えた」「描画ロジックをいじった」なら、頼まれなくても回して確認する。
- **使わない**: `algorithm/`・`core/` の純粋ロジック（→ `/tdd`）、`visualization/` でも絵に影響しない配線・型の変更。回す価値がないものに時間をかけない。

なぜ実ブラウザかは決まっている: jsdom は WebGL を再現できず `getBoundingClientRect` 等の幾何も 0 を返して静かに壊れるだけなので、描画の確認は Playwright（実 Chromium）で行う。

## ワークフロー

### 1. 視覚回帰を回す

```sh
npm run test:e2e
```

`e2e/regression.spec.ts`（fBm の 3D / 2D を seed 固定で撮る）が、`e2e/regression.spec.ts-snapshots/` の基準画像と一致するか比較する。**緑なら、その変更は既存シーンの見た目を変えていない**＝完了。

### 2. 差分が出たら「意図した変更か」を判定する

落ちたら `test-results/.../` に `*-diff.png`（差分）・`*-actual.png`（今回）・`*-expected.png`（基準）が出る。**diff と actual を Read して目で確認する**。数値（differ ratio）だけで判断しない。

- **意図どおり**（見た目を変えるのが目的だった）→ 3 へ。
- **意図しない変化**（触ったつもりのない所が変わった）→ **回帰（バグ）**。基準を更新せず、原因を直してから 1 に戻る。基準画像で隠さないこと。

### 3. 意図した変更なら baseline を撮り直す

```sh
npm run test:e2e -- --update-snapshots
```

`e2e/regression.spec.ts-snapshots/` の png が更新される。**これはコミット対象**（差分が記録として残る）。更新後にもう一度 `npm run test:e2e` を回し、緑を確認する。

### 4. README の絵を更新したいとき

見た目を意図的に変えた・ヒーロー画像を撮り直したいときは:

```sh
npm run shot
```

`e2e/readme-shot.spec.ts` がリポジトリ直下に `screenshot.png` を生成する（README が参照）。生成物は **`npm run shot` の出力と一致**している必要があるので、構図を変えたいときは spec（seed・zoom・ドラッグ量）の方を直す。

## 決定化の仕組み（要点・詳細はリポジトリが正）

視覚回帰が安定して成立しているのは次のため。深掘りは `e2e/helpers.ts`・各コメント・README「ディレクトリ構成」を見る。

- **seed 固定**で高さ関数を決定的にする（URL クエリで指定）。
- **描画収束を待つ**: LOD は数フレームかけて refine するので、`window.__terrain.settledFrames` が一定値になるまで待ってから撮る（`e2e/helpers.ts` の `waitForSettled`）。
- **撮影前に固定する**: `window.__terrain.freeze()` で描画ループを止める。連続再描画だと Playwright の安定待ちが通らず、MSAA でフレーム毎に微差も出るため。
- **`preserveDrawingBuffer: true`**（`src/visualization/gl/context.ts`）: これが無いと WebGL canvas のスクショが空になる。
- **UI を隠す**: `hideOverlays` で HUD（可変テキスト）等を消し、地形だけを比較する。

## 注意

- 基準画像は **OS 依存**（ファイル名が `*-chromium-darwin.png`）。別 OS（例: Linux の CI）で回すと GPU/レンダリングが違って一致しないので、その OS で基準画像を生成する必要がある。今はローカル（macOS）前提。
- `test-results/` は使い捨て（`.gitignore` 済み）。コミットするのは `e2e/**-snapshots/` の基準画像と `screenshot.png`。

## 完了ゲート

- `npm run test:e2e` が緑（意図した見た目変更なら baseline 更新済み・再実行で緑）。
- 見た目を変えたなら README の `screenshot.png` も `npm run shot` で更新済み（必要な場合）。
