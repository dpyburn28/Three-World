#include "uniforms.glsl"

varying vec2  vUv;
varying vec3  vWorldPos;
varying vec3  vNormal;
varying float vSlope;
varying float vHeight;
varying float vSlipFace;
varying float vCrest;

// ── Noise helpers ─────────────────────────────────────────────────────────────

float hash2(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(
        mix(hash2(i),           hash2(i+vec2(1,0)), u.x),
        mix(hash2(i+vec2(0,1)), hash2(i+vec2(1,1)), u.x),
        u.y
    );
}

// ── Sand grain texture ────────────────────────────────────────────────────────
// Models individual grain facets as high-frequency anisotropic noise
// oriented perpendicular to wind direction (grains align with wind)
// Shifts slowly over time to simulate saltation rearranging surface grains

float grainTexture(vec2 worldXZ) {
    vec2 windDir = normalize(u_windDir);
    vec2 perpDir = vec2(-windDir.y, windDir.x);

    // Anisotropic UV — stretched across wind, compressed along
    float along = dot(worldXZ, windDir);
    float cross  = dot(worldXZ, perpDir);

    // Grain pattern drifts along wind direction at ripple speed
    // Use same u_rippleSpeed so grain flow matches ripple flow visually
    float drift = u_time * u_rippleSpeed * 0.04;

    vec2 grainUV;
    grainUV.x = (along - drift) * u_grainScale * 0.5;
    grainUV.y = cross            * u_grainScale * 3.0;

    float g  = vnoise(grainUV);
    g       += 0.4 * vnoise(grainUV * 2.7 + vec2(3.1, 7.4));
    g       /= 1.4;

    // Micro-sparkle — drifts slightly faster than base grain
    float sparkleX = (along - drift * 1.4) * u_grainScale * 8.0;
    float sparkleY = cross                  * u_grainScale * 8.0;
    float sparkle  = pow(vnoise(vec2(sparkleX, sparkleY)), 6.0) * (1.0 - vSlipFace);

    return g + sparkle * 0.3;
}

void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(u_sunDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);

    // ── Base color ────────────────────────────────────────────────────────────
    vec3 sandColor = mix(u_sandDark,  u_sandBase,  smoothstep(0.0, 0.5, vHeight));
    sandColor      = mix(sandColor,   u_sandLight, smoothstep(0.5, 1.0, vHeight));

    sandColor = mix(sandColor, u_sandDark * 0.75, vSlipFace * 0.65);
    sandColor = mix(sandColor, u_sandLight * 1.05, vCrest * 0.5);

    // ── Sand grain texture ────────────────────────────────────────────────────
    float grain = grainTexture(vWorldPos.xz);
    // Remap to centered variation [-1, 1] then scale by strength
    grain = (grain - 0.5) * 2.0;
    sandColor += sandColor * grain * u_grainStrength;

    // ── Wind ripples — stoss and interdune only ────────────────────────────────
    vec2  perpDir    = vec2(-u_windDir.y, u_windDir.x);
    float ripplePhase = dot(vWorldPos.xz, perpDir) * u_rippleFreq
                      - u_time * u_rippleSpeed * 0.008;

    float ripple  = sin(ripplePhase);
    ripple       += 0.4 * sin(ripplePhase * 2.3 + 1.1);
    ripple       += 0.15 * sin(ripplePhase * 5.1 + 0.5);
    ripple       /= 1.55;

    // Ripples absent on slip face
    sandColor += sandColor * ripple * u_rippleStrength * (1.0 - vSlipFace);

    // ── Lighting ──────────────────────────────────────────────────────────────
    // Sun below horizon: fade direct + specular; avoid warm u_sunColor on ambient-only
    // (matches sky_desert contract: u_sunDir points toward the sun, +Y = up)
    float sunUp = smoothstep(-0.12, 0.08, L.y);

    float diffuse  = max(dot(N, L), 0.0);
    float lit      = u_ambientStrength + (1.0 - u_ambientStrength) * diffuse;

    float specular = pow(max(dot(N, H), 0.0), u_specularPow) * u_specularStrength;
    specular      *= (1.0 - vSlipFace * 0.9);

    // Micro-specular from grain sparkle — only on stoss, fades with roughness
    float microSpec = pow(max(dot(N, H), 0.0), u_specularPow * 4.0)
                    * u_specularStrength * 0.5
                    * (1.0 - vSlipFace);

    float ao = 0.75 + 0.25 * vHeight;

    vec3 warm = sandColor * lit * u_sunColor * ao * sunUp;
    vec3 nightFill = sandColor * ao * (0.04 + 0.06 * u_ambientStrength) * (1.0 - sunUp);
    vec3 specTint = vec3(1.0, 0.97, 0.9) * (specular + microSpec) * sunUp;

    vec3 color = warm + nightFill + specTint;

    gl_FragColor = vec4(color, 1.0);
}