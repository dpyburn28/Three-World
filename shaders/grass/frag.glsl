#include "uniforms.glsl"
#include "../_common/math.glsl"

varying float vHeight;
varying vec2  vTexCoord;
varying vec3  vNormal;
// vUv removed — was declared but never written in vert

void main() {
    vec3 baseCol = vec3(0.10, 0.42, 0.12);
    vec3 tipCol  = vec3(0.58, 0.96, 0.30);
    vec3 color   = mix(baseCol, tipCol, vHeight * vHeight);

    color *= 0.92 + 0.14 * sin(vTexCoord.y * 34.0);

    vec3  lightDir = normalize(vec3(0.5, -1.0, 0.4));
    float diffuse  = max(dot(vNormal, lightDir), 0.0);
    diffuse = 0.48 + diffuse * 0.52;

    float rim = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.0) * 0.25;

    color = color * diffuse + rim * vec3(0.35, 0.75, 0.25);

    gl_FragColor = vec4(color, 1.0);
}