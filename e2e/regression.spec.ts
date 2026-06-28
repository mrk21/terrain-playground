import { expect, test } from "@playwright/test";
import { freezeRendering, gotoTerrain, hideOverlays } from "./helpers";

// seed を固定して高さ関数を決定的にし、描画収束後の #gl canvas を基準画像と比較する。
// UI オーバーレイは隠し、描画を固定して、地形そのものだけを決定的に比較する。
const PARAMS = "gen=fbm&seed=12345&zoom=20&octaves=8&lacunarity=2&gain=0.5";

// 3D LOD が「深いリファインを要する大きなビューポート」でも収束して適切な解像度で
// 描けることを保証する（基準画像比較とは別の振る舞いテスト）。
// 過去、生成待ちノードのキャッシュ退避により四分木が最深まで降りられず、ルートの
// 巨大ポリゴン（nodes=4）で固まったまま収束しない回帰があった。既定の e2e ビューポート
// （1280x800）では浅い LOD しか踏まず見逃したため、大きいビューポートで踏みにいく。

test("fBm 3D の地形描画が基準画像と一致する", async ({ page }) => {
  await gotoTerrain(page, `view=3d&${PARAMS}`);
  await hideOverlays(page);
  await freezeRendering(page);
  await expect(page.locator("#gl")).toHaveScreenshot("fbm-3d.png");
});

test("fBm 2D の地形描画が基準画像と一致する", async ({ page }) => {
  await gotoTerrain(page, `view=2d&${PARAMS}`);
  await hideOverlays(page);
  await freezeRendering(page);
  await expect(page.locator("#gl")).toHaveScreenshot("fbm-2d.png");
});

test("大きいビューポートでも 3D LOD が収束し最深まで描画する", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1434, height: 1323 });
  // gotoTerrain は waitForSettled を含む。バグ時はここで収束せずタイムアウトする。
  await gotoTerrain(page, `view=3d&${PARAMS}`);
  const hud = await page.locator("#hud").textContent();
  const nodes = Number(hud?.match(/nodes:\s*(\d+)/)?.[1] ?? "0");
  // ルートで固まる（nodes=4）バグでないこと。適切な LOD なら数十ノード以上描く。
  expect(nodes).toBeGreaterThan(16);
});
