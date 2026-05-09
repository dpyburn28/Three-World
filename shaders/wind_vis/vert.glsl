#include "uniforms.glsl"

varying vec2 vWorldXZ; // world-space XZ, used to drive wind field in frag

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldXZ = worldPos.xz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}