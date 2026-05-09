#include "uniforms.glsl"

attribute float aHeightFrac;   // 0=on surface, 1=max air height
attribute float aSpeed;        // normalized speed 0-1 for shimmer
attribute vec3  aColor;
attribute float aAlpha;

varying vec3  vColor;
varying float vAlpha;
varying float vHeightFrac;

void main() {
    vec4 mvPos  = modelViewMatrix * vec4(position, 1.0);
    float dist  = -mvPos.z;

    // Point size: larger when close and airborne
    // Grains look bigger when in air (catching more light)
    float sizeFactor = 1.0 + aHeightFrac * 0.8;
    gl_PointSize = u_grainSize * sizeFactor * (300.0 / max(dist, 1.0));
    gl_PointSize = clamp(gl_PointSize, 0.5, 12.0);

    gl_Position  = projectionMatrix * mvPos;

    // Color: warm sandy on ground, brighter/more golden when airborne
    vColor      = mix(aColor, u_colorAir, aHeightFrac * 0.6);
    vAlpha      = aAlpha;
    vHeightFrac = aHeightFrac;
}