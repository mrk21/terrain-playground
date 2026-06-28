import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://localhost:5173";

// 地形は WebGL2 で実ブラウザでしか描けないため、E2E は実 Chromium を使う。
// 高さ関数は seed で決定的にできるので、描画収束後のスクショ比較（視覚回帰）が成立する。
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  expect: {
    toHaveScreenshot: {
      // WebGL の GPU 由来の微差を吸収する許容差（差分ピクセルが全体の 2% まで）。
      maxDiffPixelRatio: 0.02,
    },
  },
  use: {
    baseURL: BASE_URL,
    // dpr=1・固定 viewport で描画バッファサイズを決定的にする
    // （resizeToDisplay が devicePixelRatio を見るため）。
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    // dev サーバは Playwright が起動する。vite.config の server.open は
    // E2E では邪魔なので --no-open で無効化する。
    command: "npm run dev -- --no-open",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
