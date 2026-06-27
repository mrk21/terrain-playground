#version 300 es
precision highp float;

in vec3 vNormal;
in float vHeight; // 真の高さ(0..128)。ピクセルごとに色を決める。

out vec4 fragColor;

// colormap.ts と同じ値（0..1 に正規化）。
const float WATER_LEVEL = 64.0;
const float MAX_HEIGHT = 128.0;
const vec3 DEEP_WATER = vec3(5.0, 15.0, 60.0) / 255.0;
const vec3 SHALLOW_WATER = vec3(70.0, 150.0, 230.0) / 255.0;
const vec3 LOWLAND_GREEN = vec3(90.0, 160.0, 70.0) / 255.0;
const vec3 DARK_BROWN = vec3(74.0, 44.0, 20.0) / 255.0;

// 高さ → 色。頂点補間ではなくピクセルごとに評価するので、
// 水面と陸の境界も色のグラデーションもメッシュ解像度に依存せずくっきり出る。
vec3 heightToColor(float y) {
  if (y < WATER_LEVEL) {
    float t = clamp(y / WATER_LEVEL, 0.0, 1.0); // 0(深) → 1(浅)
    return mix(DEEP_WATER, SHALLOW_WATER, t);
  }
  float t = clamp((y - WATER_LEVEL) / (MAX_HEIGHT - WATER_LEVEL), 0.0, 1.0); // 0(緑) → 1(焦茶)
  return mix(LOWLAND_GREEN, DARK_BROWN, t);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(vec3(0.4, 1.0, 0.3)); // 斜め上からの平行光
  float diffuse = max(dot(N, L), 0.0);
  float light = 0.4 + 0.7 * diffuse;       // 環境光 + 拡散光
  fragColor = vec4(heightToColor(vHeight) * light, 1.0);
}
