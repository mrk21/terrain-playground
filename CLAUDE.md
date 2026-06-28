# CLAUDE.md

## 概要

プロジェクトの概要・技術スタック・セットアップ・使い方・ディレクトリ構成は [README.md](README.md) にある。まずそちらを参照する。

## README.md の更新

- npm スクリプト（`package.json` の scripts）やディレクトリ構成、技術スタックを変えたら、`/update-readme` で README.md の該当セクションを同期する。

## TDD

- `algorithm/`・`core/` に新しいロジック（関数・計算・アルゴリズム）を足す/直すときは原則テストファースト。先に失敗するテストを書いてから実装する。手順は `/tdd`。
- UI/WebGL/DOM 依存（`visualization/`）の中の計算ロジックは、環境非依存の関数に抽出して TDD する。「UI だからテストしない」と諦めない一方、テストのために設計を歪めるほど無理はしない（程度問題。詳細は `/tdd`）。

## UI/WebGL の視覚回帰（Playwright）

純粋ロジックに抽出しきれない「実際に描画された絵」は Playwright の視覚回帰で守る（TDD と役割分担。`algorithm/`・`core/` は `/tdd`、描画は視覚回帰）。jsdom は使わない（WebGL を再現できず幾何も 0 を返すだけ。実ブラウザに直行する）。

- `visualization/` の**描画に関わる**変更（シーン・シェーダ・カメラ/視点の数式など、生成される絵が変わりうるもの）をしたら `npm run test:e2e` で視覚回帰を確認する。絵に影響しない配線変更や純粋ロジックでは不要。
- 差分が出たら `test-results/` の diff 画像で**意図した変更か**を見極める:
  - 意図どおり（見た目を変えるのが目的）なら `npm run test:e2e -- --update-snapshots` で baseline を撮り直してコミットする。
  - 意図しない変化なら回帰（バグ）。直す。
- 仕組みと前提は README「ディレクトリ構成」と `e2e/`・`src/visualization/gl/context.ts` のコメント参照（seed 固定で決定的化／収束待ち `window.__terrain.settledFrames`／撮影前に `freeze()`／`preserveDrawingBuffer: true`）。baseline は OS 依存（`-chromium-darwin`）なので、別 OS の CI に載せるならその OS で baseline を生成する。
- README 用スクリーンショットを更新したいときは `npm run shot`（`screenshot.png` を生成、README が参照）。

## 複雑度と設計見直し

`npm run check`（Biome）は認知的複雑度を測る `noExcessiveCognitiveComplexity`（閾値15）を含む。**層を問わず**、編集後にこの警告が出た関数は「設計を見直す合図」。数値を下げること自体が目的ではないので、警告を踏んだら盛る前に一度止まって判断する:

- 既定は**再設計**（責務分割・データ構造・アルゴリズムの見直し）で複雑度を下げる。
- 本質的に必要な複雑さに限り、`// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: <なぜ必要か>` で理由を明記して抑制する（この理由が記録になる）。面倒だからと安易に黙らせない。
- **数値を通すためだけの機械的な関数分割もしない**（ロジックが散らばるだけで設計改善にならない）。

複雑度が溜まりやすいのは新規の純粋ロジックより**既存コード（特に `visualization/` のグルー）への機能追加**。そこを編集してこの警告を踏んだときこそ、この方針が効く。指標の意味（認知的複雑度＝ネストの深さ）や計測・閾値調整の詳細は `/tdd` の reference.md「複雑度ゲート」。
