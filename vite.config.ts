import { defineConfig } from "vite";

// シェーダは `*.vert?raw` / `*.frag?raw` の形で文字列としてインポートする。
// その他の設定は基本デフォルトで十分。
export default defineConfig({
  server: {
    open: true,
  },
});
