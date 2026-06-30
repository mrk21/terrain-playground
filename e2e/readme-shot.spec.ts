import { test } from "@playwright/test";
import { freezeRendering, gotoTerrain } from "./helpers";

// README 用のヒーロー画像を生成する（回帰テストではない。`npm run shot` で実行）。
// 既定表示そのまま（真上ビューの 3D・パラメータパネルは開いたまま）を撮り、
// リポジトリ直下に screenshot.png として保存する。seed だけ固定して決定的にする。
test("generate README screenshot", async ({ page }) => {
  // 3D は LOD の収束に時間がかかるため余裕を持たせる。
  test.setTimeout(60_000);
  // fbm の zoom/octaves/lacunarity/gain は既定値。パラメータパネルは広い画面では
  // 既定で開くので、何も操作せず（傾けず・閉じず）そのまま撮る。
  await gotoTerrain(
    page,
    "view=3d&gen=fbm&seed=78492092&zoom=50&octaves=8&lacunarity=2&gain=0.5",
  );

  // 画面中央にホバーして座標・標高 HUD(#coords) を出す（位置固定で値も決定的）。
  // カーソル自体はスクショに写らないが、左下の座標 HUD が機能を見せる。
  await page.mouse.move(640, 400);
  await page.locator("#coords").waitFor({ state: "visible" });

  await freezeRendering(page);
  await page.screenshot({ path: "screenshot.png" });
});
