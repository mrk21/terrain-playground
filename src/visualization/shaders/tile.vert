#version 300 es

// 属性なし。gl_VertexID から単位四角形の四隅を生成し、
// ワールド座標 → ビュー（中心・スケール）→ NDC に変換する。
// TRIANGLE_STRIP で 4 頂点（0,0)(1,0)(0,1)(1,1) を描く。

uniform vec2 uTileOrigin; // タイル左下のワールド座標
uniform float uTileSize;  // タイル一辺のワールド長
uniform vec2 uViewCenter; // ビュー中心のワールド座標
uniform vec2 uHalfSpan;   // 画面に映るワールド半幅（x:水平, y:垂直）
uniform vec2 uViewRight;  // 画面右方向のワールド単位ベクトル (cosθ, sinθ)。θ=heading。

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
  vec2 d = world - uViewCenter;
  // 画面基底（右・下）に射影してからスケール。uViewRight=(cosθ,sinθ)、
  // 画面下 = (−sinθ, cosθ)。heading=0 なら右=(1,0)・下=(0,1) で従来と一致する。
  vec2 right = uViewRight;
  vec2 down = vec2(-right.y, right.x);
  float sx = dot(d, right); // 画面右方向のワールド距離
  float sy = dot(d, down);  // 画面下方向のワールド距離
  // z（下）が増える向きを画面下にする（真上から見た地図の向き）。
  gl_Position = vec4(sx / uHalfSpan.x, -sy / uHalfSpan.y, 0.0, 1.0);
}
