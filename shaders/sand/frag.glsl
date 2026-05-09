#include "uniforms.glsl"

varying vec3  vColor;
varying float vAlpha;
varying float vHeightFrac;

void main() {
    // gl_PointCoord is [0,1] across the point sprite
    vec2  uv   = gl_PointCoord * 2.0 - 1.0;
    float dist = length(uv);

    // Soft circular grain — no hard edges
    float grain = 1.0 - smoothstep(0.4 - u_grainSoftness, 1.0, dist);
    if (grain < 0.01) discard;

    // Approximate a tiny spherical grain normal from the point sprite.
    // This gives directional response to u_sunDir while staying lightweight.
    float z = sqrt(max(0.0, 1.0 - dot(uv, uv)));
    vec3 grainNormal = normalize(vec3(uv, z));
    vec3 lightDir = normalize(u_sunDir);
    float sunUp = smoothstep(-0.12, 0.08, lightDir.y);
    float ndl = max(dot(grainNormal, lightDir), 0.0);
    float diffuse = mix(0.06, 1.0, sunUp) * (0.25 + 0.75 * ndl);

    // Subtle inner highlight — grains are small spheres catching light
    float highlight = smoothstep(0.6, 0.0, dist) * 0.3 * sunUp;
    vec3  color     = vColor * u_sunColor * diffuse + vec3(highlight);

    // Depth fog
    float depth  = gl_FragCoord.z / gl_FragCoord.w;
    float fogFac = 1.0 - exp(-u_fogDensity * depth * 0.0002);
    color        = mix(color, u_fogColor, fogFac);

    // Airborne grains slightly more transparent — suspended grains are finer
    float alpha  = vAlpha * grain * (1.0 - vHeightFrac * 0.3);

    gl_FragColor = vec4(color, alpha);
}