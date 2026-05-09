#include "uniforms.glsl"

varying vec2  vUv;
varying vec3  vWorldPos;
varying vec3  vNormal;
varying float vSlope;
varying float vHeight;
varying float vSlipFace;   // 0=stoss/flat, 1=slip face
varying float vCrest;      // 0=base, 1=crest

void main() {
    vUv = uv;

    float h = texture2D(u_heightmap, uv).r * u_duneHeight;

    float texel = 1.0 / float(u_hmRes);
    float cellW = u_terrainSize / float(u_hmRes);

    float hR = texture2D(u_heightmap, uv + vec2(texel, 0.0)).r * u_duneHeight;
    float hL = texture2D(u_heightmap, uv - vec2(texel, 0.0)).r * u_duneHeight;
    float hU = texture2D(u_heightmap, uv + vec2(0.0, texel)).r * u_duneHeight;
    float hD = texture2D(u_heightmap, uv - vec2(0.0, texel)).r * u_duneHeight;

    vec3 dx = normalize(vec3(cellW * 2.0, hR - hL, 0.0));
    vec3 dz = normalize(vec3(0.0, hU - hD, cellW * 2.0));
    vNormal  = normalize(cross(dz, dx));

    vSlope  = 1.0 - vNormal.y;
    vHeight = h / u_duneHeight;

    // Slope along wind direction — negative = dropping leeward = slip face
    vec2 windDir2D = normalize(u_windDir);
    float slopeAlongWind = (hR - hL) * windDir2D.x / (cellW * 2.0)
                         + (hU - hD) * windDir2D.y / (cellW * 2.0);

    // Slip face: slope drops steeply in wind direction
    vSlipFace = smoothstep(-0.05, -0.25, slopeAlongWind);

    // Crest: local maximum in wind direction
    float hWind  = texture2D(u_heightmap, uv + vec2(windDir2D.x, windDir2D.y) * texel * 1.5).r * u_duneHeight;
    float hAnti  = texture2D(u_heightmap, uv - vec2(windDir2D.x, windDir2D.y) * texel * 1.5).r * u_duneHeight;
    vCrest = smoothstep(0.5, 1.5, max(0.0, (h - hWind) + (h - hAnti)));

    vec3 pos  = position;
    pos.y     = h;
    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}