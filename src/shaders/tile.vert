#version 300 es

// 属性なし。gl_VertexID から単位四角形の四隅を生成し、
// ワールド座標 → ビュー（中心・スケール）→ NDC に変換する。
// TRIANGLE_STRIP で 4 頂点（0,0)(1,0)(0,1)(1,1) を描く。

uniform vec2 uTileOrigin; // タイル左下のワールド座標
uniform float uTileSize;  // タイル一辺のワールド長
uniform vec2 uViewCenter; // ビュー中心のワールド座標
uniform vec2 uHalfSpan;   // 画面に映るワールド半幅（x:水平, y:垂直）

out vec2 vUv;

const vec2 corners[4] = vec2[4](
  vec2(0.0, 0.0),
  vec2(1.0, 0.0),
  vec2(0.0, 1.0),
  vec2(1.0, 1.0)
);

void main() {
  vec2 c = corners[gl_VertexID];
  vUv = c;
  vec2 world = uTileOrigin + c * uTileSize;
  vec2 ndc = (world - uViewCenter) / uHalfSpan;
  // z が増える向きを画面下にする（真上から見た地図の向き）。
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}
