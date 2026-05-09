#include "../_common/math.glsl"

attribute float aU;
attribute float aV;
attribute float aW;  // half-width at this vertex (0 at tip/calamus)

// ── Varyings ────────────────────────────────────────────────────────────
varying vec3  vWorldPos;
varying vec3  vNormal;
varying vec3  vShaftTangent;
varying float vU;
varying float vV;

// ── Time (auto-injected by SceneManager) ────────────────────────────────
uniform float u_time;

// ── Wind (subset — fed by WindSystem.applyToUniforms) ───────────────────
uniform vec2  u_windDir;
uniform float u_windSpeed;
uniform float u_windStrength;
uniform float u_windWaveFreq;
uniform int   u_windWaveHarmonics;
uniform float u_gustStrength;
uniform float u_gustSpeed;
uniform float u_gustScale;
uniform float u_gustSharpness;
uniform float u_turbulence;
uniform float u_turbBaseFreq;
uniform float u_turbTimeScale;

// ── Feather wind response ───────────────────────────────────────────────
uniform float u_windReactivity;
uniform float u_flutterStrength;
uniform float u_stiffness;

// ── Barb wind (shared with frag — same uniform values) ──────────────────
uniform float u_barbDensity;
uniform float u_barbSlant;
uniform float u_barbFlex;

void main() {
    vU = aU;
    vV = aV;

    vec3 pos = position;
    vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
    vShaftTangent = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));

    // ── Wind displacement ──────────────────────────────────────────────
    float scale = u_windReactivity * 0.01;

    if (scale > 0.0001) {
        // Feather root in world space (single sample point)
        vec3 rootWorld = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec2 rootXZ = rootWorld.xz;

        // Per-instance seed from world position — ensures each feather
        // on a shared material gets unique wind behavior
        float instanceSeed = hash1(floor(rootXZ * 10.0 + 0.5));
        vec2 instanceOffset = vec2(instanceSeed * 137.5, instanceSeed * 93.2);

        // Wind direction
        vec2 windDir = normalize(u_windDir + vec2(0.0001));
        vec2 crossDir = vec2(-windDir.y, windDir.x);

        // ── Traveling sway wave ──
        float spatialPhase = dot(rootXZ, windDir) * u_windWaveFreq;
        float phase = u_time * u_windSpeed + spatialPhase + instanceSeed * 6.28318;
        float sway = sin(phase);
        if (u_windWaveHarmonics == 1) {
            sway += 0.35 * sin(phase * 2.7 + 0.5);
        }

        // ── Gust patches (advected FBM, offset per-instance) ──
        vec2 advXZ = rootXZ + instanceOffset - windDir * u_time * u_gustSpeed;
        float gustRaw = fbm(advXZ * u_gustScale);
        float gust = pow(max(0.0, gustRaw), u_gustSharpness);

        // ── Simplified turbulence (3 octaves, offset per-instance) ──
        float turbTime = u_time * u_turbTimeScale;
        float turbU = 0.0, turbV = 0.0, turbNorm = 0.0;
        float tFreq = u_turbBaseFreq;
        float tAmp = 1.0;
        vec2 turbRoot = rootXZ + instanceOffset;
        for (int i = 0; i < 3; i++) {
            float ts = tFreq * turbTime;
            turbU += noise(turbRoot * tFreq + vec2(0.0, ts)) * tAmp;
            turbV += noise(turbRoot * tFreq + vec2(47.3, 19.1 + ts * 1.7)) * tAmp;
            turbNorm += tAmp;
            tFreq *= 2.1;
            tAmp *= 0.5;
        }
        turbU = (turbU / max(turbNorm, 0.0001) - 0.5) * 2.0;
        turbV = (turbV / max(turbNorm, 0.0001) - 0.5) * 2.0;

        // ── Combined wind force (world-space XZ) ──
        float baseWind = sway * u_windStrength + gust * u_gustStrength;
        vec2 windForce = windDir * baseWind
                       + windDir * turbU * u_turbulence
                       + crossDir * turbV * u_turbulence * 0.5;

        // ── Structural modulation ──
        // Cantilever: quadratic from base to tip (beam bending)
        float cantilever = aU * aU;

        // Shaft stiffness: center resists bending, vane edges flex
        // Scale by width so converged vertices (tip/calamus) stay together
        float absV = abs(aV);
        float widthScale = smoothstep(0.0, 0.05, aW);
        float shaftFactor = mix(1.0, smoothstep(0.0, 0.3, absV), u_stiffness * widthScale);

        // Flutter: high-frequency vane edge oscillation
        float flutterPhase = u_time * u_windSpeed * 3.0 + aU * 12.0 + aV * 8.0
                           + instanceSeed * 6.28318;
        float flutter = sin(flutterPhase) * sin(flutterPhase * 2.7 + 1.3);
        float flutterMask = absV * absV * cantilever * widthScale;

        // ── Per-barb independent motion ──
        // Compute barb identity (matching frag.glsl barb phase)
        float bSlant = u_barbSlant * (1.0 - aU * 0.5);
        float bCurvedV = absV * absV;
        float bPhase = (aU - bCurvedV * bSlant) * u_barbDensity;
        float bID = floor(bPhase);
        float bFrac = fract(bPhase);

        // Per-barb random values seeded by barb ID
        float bRand = hash1(vec2(bID, 3.17));
        float bRand2 = hash1(vec2(bID, 7.93));

        // Each barb oscillates at its own phase and amplitude
        float bOscPhase = u_time * u_windSpeed * 4.0 + bRand * 6.28
                        + instanceSeed * 3.14;
        float bOsc = sin(bOscPhase) * sin(bOscPhase * 1.7 + 0.8);
        float bAmpVar = 0.7 + bRand2 * 0.6;

        // Smooth edges within each barb to avoid hard seams
        float bEdge = smoothstep(0.0, 0.15, bFrac) * smoothstep(1.0, 0.85, bFrac);

        // Suppress on shaft (absV near 0) and converged regions
        float barbVaneMask = smoothstep(0.0, 0.2, absV) * widthScale;

        // Per-barb displacement perpendicular to surface
        float barbDisp = bOsc * bAmpVar * bEdge * u_barbFlex * cantilever
                       * barbVaneMask * length(windForce) * 0.002;

        // ── Apply world-space displacement ──
        vec4 wp = modelMatrix * vec4(pos, 1.0);

        // Primary: lateral bending along wind
        wp.x += windForce.x * cantilever * shaftFactor * scale;
        wp.z += windForce.y * cantilever * shaftFactor * scale;

        // Secondary: slight upward lift as feather curves into wind
        wp.y += abs(baseWind) * cantilever * scale * 0.15;

        // Tertiary: vane flutter perpendicular to surface
        wp.xyz += worldNormal * flutter * u_flutterStrength * flutterMask
                  * length(windForce) * 0.003;

        // Quaternary: per-barb independent flexing
        wp.xyz += worldNormal * barbDisp;

        vWorldPos = wp.xyz;
        vNormal = worldNormal;

        gl_Position = projectionMatrix * viewMatrix * wp;
    } else {
        // No wind — static path (identical to original)
        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        vNormal = worldNormal;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
}
