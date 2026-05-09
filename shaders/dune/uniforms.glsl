uniform vec2  u_resolution;
uniform float u_time;
uniform int   u_frame;

uniform sampler2D u_heightmap;
uniform float     u_terrainSize;
uniform int       u_hmRes;
uniform float     u_duneHeight;
uniform float     u_rippleFreq;
uniform float     u_rippleStrength;
uniform float     u_stossLength;    // fraction of dune profile that is stoss face

uniform vec2  u_windDir;
uniform float u_windSpeed;
uniform float u_rippleSpeed;  // independent ripple speed control

uniform vec3  u_sunDir;
uniform vec3  u_sunColor;
uniform vec3  u_sandBase;
uniform vec3  u_sandDark;
uniform vec3  u_sandLight;
uniform float u_ambientStrength;
uniform float u_specularPow;
uniform float u_specularStrength;

uniform float u_grainScale;
uniform float u_grainStrength;
uniform float u_grainShift;