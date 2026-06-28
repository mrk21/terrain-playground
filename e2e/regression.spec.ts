import { expect, test } from "@playwright/test";
import { freezeRendering, gotoTerrain, hideOverlays } from "./helpers";

// seed を固定して高さ関数を決定的にし、描画収束後の #gl canvas を基準画像と比較する。
// UI オーバーレイは隠し、描画を固定して、地形そのものだけを決定的に比較する。
const PARAMS = "gen=fbm&seed=12345&zoom=20&octaves=8&lacunarity=2&gain=0.5";

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
