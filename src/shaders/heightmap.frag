#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uMap;

out vec4 fragColor;

void main() {
  // v を反転し、画面の上を z=0、下を z=100 にする（x は左が 0、右が 100）。
  fragColor = texture(uMap, vec2(vUv.x, 1.0 - vUv.y));
}
