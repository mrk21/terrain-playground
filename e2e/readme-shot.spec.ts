import { test } from "@playwright/test";
import { freezeRendering, gotoTerrain, waitForSettled } from "./helpers";

// README 用のヒーロー画像を生成する（回帰テストではない。`npm run shot` で実行）。
// 真上ビューから斜めに傾けた 3D 地形を撮り、リポジトリ直下に screenshot.png として保存する。
test("generate README screenshot", async ({ page }) => {
  // 3D は収束に時間がかかる（回転前後で 2 回待つ）ため余裕を持たせる。
  test.setTimeout(60_000);
  await gotoTerrain(
    page,
    "view=3d&gen=fbm&seed=12345&zoom=50&octaves=8&lacunarity=2&gain=0.5",
  );

  // パラメータパネルを閉じて構図をすっきりさせる（広い画面では既定で開いている）。
  await page.locator("#params-toggle").click();

  // Shift+ドラッグ（デスクトップの回転操作）で真上(pitch=π/2)から斜め視点へ傾ける。
  // 下方向ドラッグで pitch を下げ、わずかな横移動で yaw を回す。1 回の move で完結させる
  // （多ステップは重い描画ループ下でイベント配送が詰まり遅いため）。
  await page.keyboard.down("Shift");
  await page.mouse.move(640, 380);
  await page.mouse.down();
  await page.mouse.move(700, 540);
  await page.mouse.up();
  await page.keyboard.up("Shift");

  // 視点が変わると LOD を作り直すので、再び収束を待ってから固定して撮る。
  await waitForSettled(page);
  await freezeRendering(page);

  await page.screenshot({ path: "screenshot.png" });
});
