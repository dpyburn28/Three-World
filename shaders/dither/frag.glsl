#include "uniforms.glsl"
#include "common.glsl"

varying vec2 vTexCoord;

void main() {
    vec2 uv = vTexCoord;

    vec3  sourcePixel = texture2D(tDiffuse, uv).rgb;
    float grayscale   = dot(sourcePixel, vec3(0.2126, 0.7152, 0.0722));

    float ditherNoise  = noise(mod(gl_FragCoord.xy / u_ditherScale, 1.0) * 100.0);
    ditherNoise       -= 0.5;
    ditherNoise       *= u_ditherStrength;

    float dithered = grayscale + ditherNoise;
    float bit      = dithered >= 0.5 ? 1.0 : 0.0;

    // Dithered grayscale result
    vec3 ditherValue = vec3(bit);

    vec3 ditherColor = step(0.5, sourcePixel + ditherNoise);

    // Blend between dithered grayscale and original color
    vec3 finalColor = mix(ditherValue, ditherColor, u_keepColor);


    gl_FragColor = vec4(finalColor, 1.0);
}