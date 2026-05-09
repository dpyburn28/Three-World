#include "uniforms.glsl"

varying vec3 vWorldDir;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash3(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(
        mix(hash(i),           hash(i+vec2(1,0)), f.x),
        mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x),
        f.y
    );
}

float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 6; i++) {
        v += a * noise(p);
        p  = rot * p * 2.1 + vec2(5.2, 1.3);
        a *= 0.5;
    }
    return v;
}

// ── Stars ─────────────────────────────────────────────────────────────────────

float stars(vec3 dir) {
    vec2 uv   = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0)));
    uv       *= u_starDensity;

    vec2 cell = floor(uv);
    vec2 frac = fract(uv);
    float star = 0.0;

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2  nc     = cell + vec2(float(x), float(y));
            float rng    = hash(nc);
            float rng2   = hash(nc + vec2(13.7, 57.3));
            vec2  center = vec2(rng, rng2);
            float dist   = length(frac - vec2(float(x), float(y)) - center);

            float bright = hash(nc + vec2(99.1, 7.3));
            bright       = pow(bright, 3.0);

            float size   = u_starSize * (0.5 + bright * 0.5) * 0.03;
            star        += bright * smoothstep(size, size * 0.3, dist);
        }
    }

    float twinkle = 0.8 + 0.2 * sin(u_time * 1.5 + hash3(dir * 10.0) * 40.0);
    return star * twinkle * u_starBrightness;
}

// ── Sun disc and corona ───────────────────────────────────────────────────────

vec3 sunDisc(vec3 dir) {
    float cosAngle = dot(dir, normalize(u_sunDir));
    float angle    = acos(clamp(cosAngle, -1.0, 1.0));

    float disc   = smoothstep(u_sunSize, u_sunSize * 0.7, angle);
    float bloom1 = exp(-angle * 8.0  / max(u_sunBloom, 0.001)) * 0.6;
    float bloom2 = exp(-angle * 20.0 / max(u_sunBloom, 0.001)) * 0.3;
    float bloom3 = exp(-angle * 2.0  / max(u_sunBloom * 3.0, 0.001)) * 0.15;

    float total  = clamp(disc + bloom1 + bloom2 + bloom3, 0.0, 1.0);

    // White core, tinted corona edge
    vec3 coronaColor = mix(u_sunColor * 1.2, vec3(1.0), disc);
    return coronaColor * total;
}

// ── Mie scattering ────────────────────────────────────────────────────────────

float mieScatter(vec3 dir) {
    float cosTheta = dot(dir, normalize(u_sunDir));
    return u_hazeStrength * pow(max(0.0, cosTheta), 6.0);
}

void main() {
    vec3  dir = normalize(vWorldDir);
    float h   = dir.y;

    // ── Sky gradient ──────────────────────────────────────────────────────────
    float hUp   = clamp( h + u_horizonOffset, 0.0, 1.0);
    float hDown = clamp(-h + u_horizonOffset, 0.0, 1.0);

    vec3 skyColor = mix(u_horizonColor, u_zenithColor,
                        pow(hUp, u_horizonSharpness));
    skyColor      = mix(skyColor, u_groundColor,
                        pow(hDown * 1.5, 0.7));

    // ── Mie / haze ────────────────────────────────────────────────────────────
    float mie      = mieScatter(dir);
    // Smooth exponential falloff with elevation
    float nearH    = exp(-abs(h) * 4.0);
    // Only scatter toward sun — prevents 360° halo
    float sunHemi  = max(0.0, dot(dir, normalize(u_sunDir)));
    skyColor       = mix(skyColor, u_hazeColor, mie * nearH * sunHemi * 0.7);

    // ── Clouds ────────────────────────────────────────────────────────────────
    // Protected denominator — prevents UV explosion near horizon
    float cloudProj = max(dir.y + u_cloudHeight, 0.05);
    vec2  cloudUv   = dir.xz / cloudProj * u_cloudScale;

    // Normalized cloud density — fbm output divided back to [0,1]
    float c = fbm(cloudUv + u_time * u_cloudSpeed);
    c      += 0.5 * fbm(cloudUv * 2.0 + u_time * u_cloudSpeed * 1.6);
    c      /= 1.5;
    float cloud = smoothstep(u_cloudDensity, u_cloudDensity + u_cloudSoftness, c);

    float cloudMask = smoothstep(u_cloudHeight - 0.05, u_cloudHeight + 0.15, dir.y);
    cloud          *= cloudMask;

    float sunDot    = dot(dir, normalize(u_sunDir));
    float cloudLit  = 0.6 + 0.4 * sunDot;
    vec3  cCol      = mix(u_cloudShadowColor, u_cloudColor * u_cloudBrightness, cloudLit);
    skyColor        = mix(skyColor, cCol, cloud * 0.85);

    // ── Stars ─────────────────────────────────────────────────────────────────
    float starVis = smoothstep(-0.05, 0.1, h) * u_nightBlend;
    starVis      *= (1.0 - cloud * 0.95);
    skyColor     += vec3(0.9, 0.92, 1.0) * stars(dir) * starVis;

    // ── Sun ───────────────────────────────────────────────────────────────────
    // Wider transition so sun fades properly at sunset
    float sunElevation = dot(normalize(u_sunDir), vec3(0.0, 1.0, 0.0));
    float sunVis       = smoothstep(-0.1, 0.05, sunElevation);
    skyColor          += sunDisc(dir) * sunVis;

    gl_FragColor = vec4(skyColor, 1.0);
}