uniform vec2  u_resolution;
uniform float u_time;
uniform int   u_frame;
uniform vec2  u_mouse;

uniform float u_bladeHeight;
uniform float u_fieldSize;

// Wind — base
uniform vec2  u_windDir;
uniform float u_windSpeed;
uniform float u_windStrength;
uniform float u_windWaveFreq;
uniform int   u_windWaveHarmonics;

// Wind — gusts
uniform float u_gustStrength;
uniform float u_gustSpeed;
uniform float u_gustScale;
uniform float u_gustSharpness;

// Wind — turbulence
uniform float u_turbulence;
uniform float u_turbBaseFreq;
uniform int   u_turbOctaves;
uniform float u_turbLacunarity;
uniform float u_turbGain;
uniform float u_turbTimeScale;

// Wind — boundary layer
uniform int   u_boundaryLayer;
uniform float u_roughnessLength;
uniform float u_referenceHeight;

// Wind — shear
uniform int   u_shear;
uniform float u_shearAngle;
uniform float u_shearHeight;

// Proximity
uniform sampler2D u_proximityField;
uniform float     u_pftResolution;
uniform sampler2D u_interactionMap;
uniform vec4      u_colliders[8];
uniform int       u_numColliders;
uniform float     u_influenceMult;