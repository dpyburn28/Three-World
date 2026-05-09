#include "uniforms.glsl"

varying vec2 vTexCoord;

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec4 datamosh(vec2 uv) {
    vec4  src        = texture2D(u_tex,  uv);
    float currentLum = dot(src.rgb, u_lumWeights);

    vec4  prev    = texture2D(u_prev, uv);
    float prevLum = dot(prev.rgb, u_lumWeights);

    float delta     = abs(currentLum - prevLum) * u_deltaScale;
    float threshold = u_thresholdMax * (1.0 - exp(-u_thresholdRamp * u_time));

    float time  = u_time * u_spawnSpeed;
    float index = floor(time);
    float chunk = u_spawnScale;
    bool  spawn = hash12(floor(uv * hash11(index + u_spawnSeed) * chunk) + index) > u_spawnRate;

    vec3 result;

    if (u_frame < 1 || spawn) {
        result = src.rgb;
    } else if (delta < threshold) {
        result = prev.rgb;
    } else {
        result = src.rgb;
    }

    return vec4(result, 1.0);
}

void main() {
    gl_FragColor = datamosh(vTexCoord);
}