uniform sampler2D tDiffuse;   // composer input — replaces p5's tex0
uniform vec2      u_resolution;
uniform float     u_ditherScale;
uniform float     u_ditherStrength;

uniform float u_keepColor; // 0.0 = grayscale dither, 1.0 = keep original color