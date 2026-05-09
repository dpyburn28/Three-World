uniform vec2  u_resolution;
uniform float u_time;

// Grain appearance
uniform float u_grainSize;       // base point size in pixels
uniform float u_grainSoftness;   // edge falloff
uniform vec3  u_colorGround;     // color when at surface
uniform vec3  u_colorAir;        // color when airborne (brighter, more yellow)
uniform float u_opacity;

// Atmospheric
uniform vec3  u_fogColor;
uniform float u_fogDensity;
uniform vec3  u_sunDir;
uniform vec3  u_sunColor;

// Passed per-vertex from CPU
// (height above terrain, normalized 0–1)
// carried as aHeightFrac