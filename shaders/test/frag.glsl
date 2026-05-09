varying vec3 vNormal;
varying vec3 vPosition;

uniform float uTime;

void main() {
    vec3 col = vNormal * 0.5 + 0.5;          // remap normals to 0-1
    col.r += sin(uTime + vPosition.x) * 0.2; // subtle time-based pulse
    gl_FragColor = vec4(col, 1.0);
}