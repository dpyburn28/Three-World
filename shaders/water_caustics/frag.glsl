#include "uniforms.glsl"
#include "common.glsl"

varying vec2 vTexCoord;

vec3 screenToWorldPlane(
    vec2 screenUV,
    vec3 camDir,
    float focalLength,
    vec3 worldOffset,
    float worldScale
) {
    vec3 camForward = normalize(camDir);
    vec3 camRight   = normalize(cross(camForward, vec3(0.0, 1.0, 0.0)));
    vec3 camUp      = normalize(cross(camRight, camForward));

    vec3 rayDir = screenUV.x * camRight
                + screenUV.y * camUp
                + focalLength * camForward;

    if (abs(rayDir.y) < 1e-6) return vec3(0.0);

    float tHit          = camForward.y / rayDir.y;
    vec3  planeHitPoint = -camForward + rayDir * tHit;

    planeHitPoint += worldOffset;
    planeHitPoint *= worldScale;

    return planeHitPoint;
}

vec4 warpedNoisePattern(
    vec3  pos,
    float warpStrength,
    int   warpIterations,
    float contrastScale,
    float contrastBias,
    vec3  color
) {
    #define MAX_WARP_ITERATIONS 8

    vec4 n;
    for (int i = 0; i < MAX_WARP_ITERATIONS; i++) {
        if (i >= warpIterations) break;
        n    = snoise(pos);
        pos -= warpStrength * n.xyz;
    }

    n = snoise(pos);

    float intensity = exp(n.w * contrastScale - contrastBias);
    return vec4(color * intensity, 1.0);
}

void main() {
    float t = u_time * u_timeSpeed;

    vec3 worldOffset = u_worldOffset;
    worldOffset.y   += t;

    vec3 pos = screenToWorldPlane(
        vTexCoord,
        u_cameraDir,
        u_focalLength,
        worldOffset,
        u_worldScale
    );

    vec4 pattern = warpedNoisePattern(
        pos,
        u_warpStrength,
        u_warpIterations,
        u_contrastScale,
        u_contrastBias,
        u_color
    );

    gl_FragColor = pattern;
}