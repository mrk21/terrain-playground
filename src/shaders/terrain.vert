#version 300 es

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in float aHeight; // 真の高さ(0..128)。色はフラグメントで決める。

uniform mat4 uMvp;

out vec3 vNormal;
out float vHeight;

void main() {
  // モデル行列は単位行列なので、法線はワールド空間のまま渡してよい。
  vNormal = aNormal;
  vHeight = aHeight;
  gl_Position = uMvp * vec4(aPosition, 1.0);
}
