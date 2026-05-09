#include "uniforms.glsl"
#include "../_common/math.glsl"

varying vec2  vTexCoord;
varying float vHeight;
varying vec3  vNormal;

// ── Boundary layer ────────────────────────────────────────────────────────────
float boundaryLayerScale(float y) {
    if (u_boundaryLayer == 0) return 1.0;
    float z0 = max(u_roughnessLength, 0.001);
    float h  = max(y, z0 * 1.01);
    float hr = max(u_referenceHeight, z0 * 2.0);
    return log(h / z0) / log(hr / z0);
}

// ── Shear — direction rotates with height ────────────────────────────────────
vec2 windDirAtHeight(float y) {
    if (u_shear == 0) return normalize(u_windDir);
    float frac  = clamp(y / max(u_shearHeight, 1.0), 0.0, 1.0);
    float angle = atan(u_windDir.y, u_windDir.x) + u_shearAngle * frac;
    return vec2(cos(angle), sin(angle));
}

// ── Value noise ───────────────────────────────────────────────────────────────
float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    float a = hash1(i);
    float b = hash1(i+vec2(1,0));
    float c = hash1(i+vec2(0,1));
    float d = hash1(i+vec2(1,1));
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

float fbm2(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * vnoise(p);
        p  = p * 2.1 + vec2(5.2, 1.3);
        a *= 0.5;
    }
    return v * 2.0 - 0.5;
}

// ── Turbulence spectrum ───────────────────────────────────────────────────────
vec2 turbulence(vec2 worldXZ, float t) {
    float u = 0.0, v = 0.0;
    float freq = u_turbBaseFreq;
    float amp  = 1.0;
    float norm = 0.0;

    for (int i = 0; i < 8; i++) {
        if (i >= u_turbOctaves) break;
        float ts = freq * u_turbTimeScale;
        u    += vnoise(worldXZ * freq + vec2(0.0,       t * ts      )) * amp;
        v += vnoise(worldXZ * freq + vec2(47.3, 19.1 + t * ts)) * amp;
        norm += amp;
        freq *= u_turbLacunarity;
        amp  *= u_turbGain;
    }

    return vec2(u, v) / max(norm, 0.0001);
}

void main() {
    vec3  base = position;
    float t    = uv.y;
    float side = (uv.x - 0.5) * 2.0;

    float rand   = hash1(base.xz);
    float height = u_bladeHeight * (0.8 + rand * 0.45);
    float width  = 5.0 * (1.0 - t * 0.68);

    vec3 pos = base;
    pos.x   += side * width * 0.5;

    // ── PROXIMITY FIELD ───────────────────────────────────────────────────────
    vec2 fuv = (base.xz + u_fieldSize * 0.5) / u_fieldSize;
    float influence = texture2D(u_proximityField, fuv).r;

    if (influence > 0.01) {
        float d  = 1.0 / float(u_pftResolution);
        float sL = texture2D(u_proximityField, fuv + vec2(-d,  0.0)).r;
        float sR = texture2D(u_proximityField, fuv + vec2( d,  0.0)).r;
        float sU = texture2D(u_proximityField, fuv + vec2( 0.0, -d)).r;
        float sD = texture2D(u_proximityField, fuv + vec2( 0.0,  d)).r;
        vec2  dir = normalize(vec2(sR-sL, sD-sU) + 0.0001);
        float str = influence * 1.8;

        height *= mix(1.0, 0.22, str);
        float push = str * 28.0;
        pos.x += dir.x * push * (0.5 + 0.5 * t);
        pos.z += dir.y * push * (0.5 + 0.5 * t);
        pos.x += dir.x * str * height * t * 0.7;
        pos.z += dir.y * str * height * t * 0.7;
    }

    pos.y = height * t;

    // ── WIND ──────────────────────────────────────────────────────────────────

    // Direction at this blade's effective height
    float bladeTopY  = height;  // tip height in world space
    vec2  windDir    = windDirAtHeight(bladeTopY);
    vec2  crossDir   = vec2(-windDir.y, windDir.x);

    // Boundary layer — blades near ground move less
    float bl = boundaryLayerScale(bladeTopY);

    // Traveling sway wave
    float spatialPhase = dot(base.xz, windDir) * u_windWaveFreq;
    float phase        = u_time * u_windSpeed + spatialPhase + rand * 2.0;
    float sway         = sin(phase);
    if (u_windWaveHarmonics == 1) sway += 0.35 * sin(phase * 2.7 + 0.5);

    // Localized gust patches — advect sample backwards along wind
    vec2  advXZ    = base.xz - windDir * u_time * u_gustSpeed;
    float gustRaw  = fbm2(advXZ * u_gustScale);
    float gust     = pow(max(0.0, gustRaw), u_gustSharpness);

    // Turbulence spectrum
    vec2  turb = turbulence(base.xz, u_time);

    // Height weighting — tips sway more than roots
    float hw = pow(t, 1.75);

    // Combined displacement
    float baseWind  = (sway * u_windStrength + gust * u_gustStrength) * bl * hw;
    float turbU     = turb.x * u_turbulence * bl * hw;
    float turbV     = turb.y * u_turbulence * bl * hw;

    pos.x += windDir.x  * baseWind + turbU * windDir.x  + turbV * crossDir.x;
    pos.z += windDir.y  * baseWind + turbU * windDir.y  + turbV * crossDir.y;

    // Approximate lighting normal from wind lean
    float totalLean = length(vec2(
        windDir.x * baseWind + turbU,
        windDir.y * baseWind + turbV
    ));
    vNormal   = normalize(vec3(-windDir.x * totalLean * 0.18, -1.0, -windDir.y * totalLean * 0.18 + 0.4));
    vTexCoord = uv;
    vHeight   = t;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}