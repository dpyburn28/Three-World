varying vec3 vWorldDir;

void main() {
    // World position of the sphere vertex (no translation — sky is infinite)
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(worldPos.xyz);

    vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // Push to far plane — sky always loses depth test against real geometry
    gl_Position = pos.xyww;
}