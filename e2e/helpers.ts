import type { Page } from "@playwright/test";

/** main.ts が公開する E2E フックを持つ window。 */
type TerrainWindow = Window & {
  __terrain?: { settledFrames: number; freeze(): void };
};

/**
 * LOD が連続 `frames` フレーム収束する（これ以上待っても絵が変わらない）まで待つ。
 * WebGL + LOD は canvas が DOM に乗った時点では描き終わっていないため、
 * Playwright の auto-wait では足りない。app 側の収束シグナルを待つ必要がある。
 */
export async function waitForSettled(page: Page, frames = 3): Promise<void> {
  await page.waitForFunction(
    (need) => {
      const t = (window as TerrainWindow).__terrain;
      return !!t && t.settledFrames >= need;
    },
    frames,
    { timeout: 30_000 },
  );
}

/** 決定的なクエリ（seed 固定など）で地形を開き、描画が収束するまで待つ。 */
export async function gotoTerrain(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await waitForSettled(page);
}

/**
 * スクショから UI オーバーレイ（パネル・カメラ操作・HUD/ヒント）を隠して地形だけにする。
 * #gl は全画面なので、これらを消さないと canvas のスクショに重なって写り込む。
 * HUD は可変テキスト（nodes 数など）なので、基準画像の安定化にも必須。
 */
export async function hideOverlays(page: Page): Promise<void> {
  await page.addStyleTag({
    content: "#panel,#camera,#bottom{display:none!important}",
  });
}

/**
 * 描画ループを止めて画を固定する（preserveDrawingBuffer により最後のフレームが残る）。
 * 連続再描画による MSAA のフレーム間ノイズや Playwright の安定待ち失敗を避け、決定的に撮る。
 * 収束（waitForSettled）後に呼ぶこと。
 */
export async function freezeRendering(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as TerrainWindow).__terrain?.freeze();
  });
}
