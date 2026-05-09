uniform vec2  u_resolution;
uniform float u_time;

// Sun
uniform vec3  u_sunDir;          // normalized direction toward sun
uniform vec3  u_sunColor;
uniform float u_sunSize;
uniform float u_sunBloom;

// Sky gradient
uniform vec3  u_zenithColor;
uniform vec3  u_horizonColor;
uniform vec3  u_groundColor;
uniform float u_horizonSharpness;
uniform float u_horizonOffset;

// Atmosphere / haze
uniform vec3  u_hazeColor;
uniform float u_hazeStrength;    // amount of sun-forward scattering

// Clouds
uniform float u_cloudSpeed;
uniform float u_cloudScale;
uniform float u_cloudDensity;
uniform float u_cloudSoftness;
uniform float u_cloudBrightness;
uniform float u_cloudHeight;
uniform vec3  u_cloudColor;
uniform vec3  u_cloudShadowColor;

// Stars
uniform float u_starDensity;
uniform float u_starBrightness;
uniform float u_starSize;
uniform float u_nightBlend;      // 0=day, 1=full night — driven by sun elevation