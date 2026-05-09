attribute float surfaceType;

varying vec3  vNormal;
varying vec3  vWorldPos;
varying vec2  vUv;
varying float vSurfaceType;

void main() {
    vUv          = uv;
    vNormal      = normalize(mat3(modelMatrix) * normal);
    vSurfaceType = surfaceType;

    vec4 wp   = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
