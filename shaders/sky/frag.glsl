#include "uniforms.glsl"

varying vec3 vWorldDir;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    vec3 dir = normalize(vWorldDir);
    float h  = clamp(dir.y + u_horizonOffset, 0.0, 1.0);

    // Sky gradient
    vec3 skyColor = mix(u_bottomColor, u_topColor, h);

    // Spherical UVs — work on the entire dome, no horizon singularity
    vec2 cloudUv = vec2(atan(dir.z, dir.x), dir.y) * u_cloudScale;

    float cloud = noise(cloudUv + u_time * u_cloudSpeed);
    cloud += 0.5 * noise(cloudUv * 2.0 + u_time * u_cloudSpeed * 1.6);
    cloud = smoothstep(u_cloudDensity, u_cloudDensity + u_cloudSoftness, cloud);

    // u_cloudHeight: -1.0 = full sphere, 0.0 = horizon, 1.0 = top only
    float cloudMask = smoothstep(u_cloudHeight - 0.1, u_cloudHeight + 0.1, dir.y);
    cloud *= cloudMask;

    vec3 cloudColor = vec3(u_cloudBrightness);
    vec3 color = mix(skyColor, cloudColor, cloud * 0.8);

    gl_FragColor = vec4(color, 1.0);
}