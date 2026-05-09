#include "uniforms.glsl"

varying vec2 vTexCoord;

void main() {
    vTexCoord = uv;          // Three.js built-in, equivalent to p5's aTexCoord
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}