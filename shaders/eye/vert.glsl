#include "uniforms.glsl"

varying vec2 vTexCoord;

void main() {
    // Reproduce p5's vTexCoord derivation exactly:
    // normalize world XY by eyeRadius into [0,1] UV space
    vTexCoord = position.xy / u_eyeRadius * 0.5 + 0.5;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}