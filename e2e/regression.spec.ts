import { expect, test } from "@playwright/test";
import {
  freezeRendering,
  gotoTerrain,
  hideOverlays,
  waitForSettled,
} from "./helpers";

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

// 2D ビューの回転（Shift+ドラッグ）で地図が実際に傾いて描かれることを守る。
// フリング（慣性回転）で最終角度がぶれないよう、離す前に一拍おいて release 速度を
// 0 にする＝heading は総ドラッグ量だけで決まり決定的になる。
test("fBm 2D は Shift+ドラッグで回転して描画される", async ({ page }) => {
  await gotoTerrain(page, `view=2d&${PARAMS}`);
  const box = await page.locator("#gl").boundingBox();
  if (!box) throw new Error("#gl の領域が取れません。");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Shift を押しながら中心から左へドラッグ＝約 +30°（heading -= dx*0.005, dx=-120）。
  await page.keyboard.down("Shift");
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 120, cy, { steps: 12 });
  await page.waitForTimeout(350); // 慣性が乗らないよう静止してから離す。
  await page.mouse.up();
  await page.keyboard.up("Shift");

  await waitForSettled(page); // 回転後の解像度が揃う（＝慣性も止まる）まで待つ。
  await hideOverlays(page);
  await freezeRendering(page);
  await expect(page.locator("#gl")).toHaveScreenshot("fbm-2d-rotated.png");
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
