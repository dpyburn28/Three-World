#include "uniforms.glsl"

varying vec2 vWorldXZ;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i),              hash(i + vec2(1, 0)), f.x),
        mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x),
        f.y
    );
}

// Wind vector at a world-space XZ position — mirrors grass vert exactly
vec2 windVector(vec2 worldXZ, float t) {
    vec2 windDir  = normalize(u_windDir);
    vec2 crossDir = vec2(-windDir.y, windDir.x);

    float spatialPhase = dot(worldXZ, windDir) * u_windWaveFreq;
    float phase        = t * u_windSpeed + spatialPhase;

    float sway    = sin(phase) + 0.35 * sin(phase * 2.7 + 0.5);
    float gustPhase = t * u_gustSpeed + spatialPhase * 0.3;
    float gust      = pow(max(0.0, sin(gustPhase * u_gustFrequency * 6.28318)), 3.0);

    float baseAmt  = sway * u_windStrength;
    float gustAmt  = gust * u_gustStrength;
    float crossAmt = sin(phase * 3.1) * u_turbulence;

    return windDir * (baseAmt + gustAmt) + crossDir * crossAmt;
}

float gustIntensity(vec2 worldXZ, float t) {
    vec2  windDir      = normalize(u_windDir);
    float spatialPhase = dot(worldXZ, windDir) * u_windWaveFreq;
    float gustPhase    = t * u_gustSpeed + spatialPhase * 0.3;
    return pow(max(0.0, sin(gustPhase * u_gustFrequency * 6.28318)), 3.0);
}

float streamline(vec2 worldXZ, float t) {
    // Scale world coords to noise space
    vec2  p       = worldXZ * (u_lineScale / u_fieldSize);
    float stepSize = u_lineLength / float(u_lineSteps);
    float accum   = 0.0;
    float weight  = 0.0;

    vec2 windDir = normalize(windVector(worldXZ, t) + 0.0001);

    for (int i = 0; i < 64; i++) {
        if (i >= u_lineSteps) break;

        float fi      = (float(i) / float(u_lineSteps - 1)) - 0.5;
        float falloff = 1.0 - pow(abs(fi) * 2.0, u_lineFade);

        // Trace forward and backward along wind direction
        vec2 fwd  = p + windDir * stepSize * float(i)  * u_lineScale;
        vec2 bwd  = p - windDir * stepSize * float(i)  * u_lineScale;

        accum  += (noise(fwd) + noise(bwd)) * falloff;
        weight += 2.0 * falloff;
    }

    return weight > 0.0 ? accum / weight : 0.0;
}

void main() {
    float t = u_time;

    // Scroll noise with wind so lines appear to move
    vec2  windDir    = normalize(u_windDir);
    float speed      = length(windVector(vWorldXZ, t)) * 0.002;
    vec2  scrolledXZ = vWorldXZ + windDir * t * speed * u_fieldSize;

    float lic   = streamline(scrolledXZ, t);
    float lines = smoothstep(0.38, 0.62, lic);

    float gust  = gustIntensity(vWorldXZ, t);
    float alpha = lines * (u_lineOpacity + gust * u_gustOpacity);

    gl_FragColor = vec4(u_lineColor * alpha, alpha);
}