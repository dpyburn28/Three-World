#include "../_common/math.glsl"

uniform vec3  u_sunDir;
uniform vec3  u_sunColor;

uniform vec3  u_wallColor;
uniform vec3  u_windowColor;
uniform vec3  u_trimColor;
uniform vec3  u_roofColor;

uniform float u_ambientStrength;
uniform float u_specularPow;
uniform float u_specularStrength;
uniform float u_windowEmission;

// Brick uniforms
uniform float u_brickWidth;
uniform float u_brickHeight;
uniform float u_mortarWidth;
uniform vec3  u_mortarColor;
uniform float u_brickVariation;
uniform float u_brickNoiseScale;
uniform float u_brickNoiseStrength;

// Glass uniforms
uniform vec3  u_glassReflectColor;
uniform float u_glassReflectStrength;
uniform float u_glassFresnel;

// Door / wood uniforms
uniform vec3  u_doorColor;
uniform vec3  u_doorGrainColor;
uniform float u_woodGrainScale;
uniform float u_woodGrainStrength;

varying vec3  vNormal;
varying vec3  vWorldPos;
varying vec2  vUv;
varying float vSurfaceType;

// ── Triplanar UV from world position ───────────────────────────────────
vec2 getWallUV(vec3 worldPos, vec3 normal) {
    vec3 aN = abs(normal);
    if (aN.x > aN.y && aN.x > aN.z) return worldPos.zy;  // X-facing
    if (aN.y > aN.z)                 return worldPos.xz;  // Y-facing
    return worldPos.xy;                                     // Z-facing
}

// ── Brick pattern ──────────────────────────────────────────────────────
vec3 brickPattern(vec3 worldPos, vec3 normal, vec3 baseColor) {
    vec2 wallUV = getWallUV(worldPos, normal);

    // Running bond layout
    vec2 brickUV = wallUV / vec2(u_brickWidth, u_brickHeight);
    float row    = floor(brickUV.y);
    float offset = mod(row, 2.0) * 0.5;
    brickUV.x   += offset;

    vec2 brickID   = floor(brickUV);
    vec2 brickFrac = fract(brickUV);

    // Mortar mask: 1.0 inside brick, 0.0 on mortar
    float mortarX = smoothstep(0.0, u_mortarWidth, brickFrac.x)
                  * smoothstep(0.0, u_mortarWidth, 1.0 - brickFrac.x);
    float mortarY = smoothstep(0.0, u_mortarWidth, brickFrac.y)
                  * smoothstep(0.0, u_mortarWidth, 1.0 - brickFrac.y);
    float isBrick = mortarX * mortarY;

    // Per-brick color variation
    float h = hash1(brickID);
    vec3 brickCol = baseColor * (1.0 + (h - 0.5) * 2.0 * u_brickVariation);

    // Surface noise overlay
    float surfNoise = noise(wallUV * u_brickNoiseScale * 10.0);
    brickCol += brickCol * (surfNoise - 0.5) * u_brickNoiseStrength;

    // Blend brick and mortar
    return mix(u_mortarColor, brickCol, isBrick);
}

// ── Glass color with Fresnel reflection ────────────────────────────────
vec3 glassColor(vec3 N, vec3 V) {
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), u_glassFresnel);
    return mix(u_windowColor, u_glassReflectColor, fresnel * u_glassReflectStrength);
}

// ── Wood color for doors ───────────────────────────────────────────────
vec3 woodColor(vec3 worldPos, vec3 normal) {
    vec2 woodUV = getWallUV(worldPos, normal);
    // Vertical grain: stretch Y, compress X
    float grain = noise(vec2(woodUV.x * u_woodGrainScale * 5.0,
                             woodUV.y * u_woodGrainScale));
    // Ring-like sub-pattern for detail
    float rings = noise(vec2(woodUV.x * u_woodGrainScale * 12.0,
                             woodUV.y * u_woodGrainScale * 2.0));
    float pattern = grain * 0.7 + rings * 0.3;
    return mix(u_doorColor, u_doorGrainColor, pattern * u_woodGrainStrength);
}

void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(u_sunDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);

    // Branchless surface-type selection
    float isWindow = step(0.5, vSurfaceType) * (1.0 - step(1.5, vSurfaceType));  // type 1
    float isTrim   = step(1.5, vSurfaceType) * (1.0 - step(2.5, vSurfaceType));  // type 2
    float isRoof   = step(2.5, vSurfaceType) * (1.0 - step(3.5, vSurfaceType));  // type 3
    float isDoor   = step(3.5, vSurfaceType);                                     // type 4
    float isWall   = 1.0 - isWindow - isTrim - isRoof - isDoor;                  // type 0

    // Surface colors with brick/glass/wood textures
    vec3 wallBrick = brickPattern(vWorldPos, N, u_wallColor);
    vec3 trimBrick = brickPattern(vWorldPos, N, u_trimColor);
    vec3 glass     = glassColor(N, V);
    vec3 wood      = woodColor(vWorldPos, N);

    vec3 baseColor = wallBrick   * isWall
                   + glass       * isWindow
                   + trimBrick   * isTrim
                   + u_roofColor * isRoof
                   + wood        * isDoor;

    // Diffuse (Lambertian)
    float diffuse = max(dot(N, L), 0.0);
    float lit     = u_ambientStrength + (1.0 - u_ambientStrength) * diffuse;

    // Specular (Blinn-Phong) — skip on windows and doors
    float specular = pow(max(dot(N, H), 0.0), u_specularPow)
                   * u_specularStrength
                   * (1.0 - isWindow)
                   * (1.0 - isDoor);

    // Window self-illumination
    vec3 emission = u_windowColor * u_windowEmission * isWindow;

    vec3 color = baseColor * lit * u_sunColor + vec3(specular) + emission;

    gl_FragColor = vec4(color, 1.0);
}
