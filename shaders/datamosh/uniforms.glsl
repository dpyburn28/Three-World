uniform vec2  u_resolution;
uniform float u_time;
uniform int   u_frame;

uniform sampler2D u_tex;   // current scene render
uniform sampler2D u_prev;  // previous datamosh accumulation (ping-pong)

uniform float u_thresholdMax;
uniform float u_thresholdRamp;
uniform float u_spawnRate;
uniform float u_spawnScale;
uniform float u_spawnSpeed;
uniform float u_spawnSeed;
uniform vec3  u_lumWeights;

uniform float u_deltaScale;