#include "../_common/math.glsl"

uniform vec3  u_sunDir;
uniform vec3  u_sunColor;

// Surface colors
uniform vec3  u_asphaltColor;
uniform vec3  u_curbColor;
uniform vec3  u_sidewalkColor;

uniform float u_ambientStrength;

// Asphalt noise
uniform float u_asphaltNoiseScale;
uniform float u_asphaltNoiseStrength;

// Lane markings
uniform float u_roadWidth;
uniform float u_laneLineWidth;
uniform float u_dashLength;
uniform float u_gapLength;
uniform float u_edgeLineOffset;
uniform vec3  u_lineColor;

// Sidewalk joints
uniform float u_jointSpacing;
uniform float u_jointWidth;
uniform vec3  u_jointColor;

// Grid uniforms (set programmatically; 0 = single-road mode)
uniform float u_gridSpacingX;
uniform float u_gridSpacingZ;
uniform float u_gridOriginX;
uniform float u_gridOriginZ;

varying vec3  vNormal;
varying vec3  vWorldPos;
varying vec2  vUv;
varying float vSurfaceType;

// ── Lane marking helper ─────────────────────────────────────────────────
// Computes lane line mask for a road centered at roadCenter along roadAxis.
// `roadDist` = signed distance from road center (perpendicular to road)
// `roadAlong` = position along the road (parallel to road)
float laneMarkings(float roadDist, float roadAlong) {
    float halfRW = u_roadWidth / 2.0;

    // Center dashed line
    float centerDist = abs(roadDist);
    float centerMask = 1.0 - smoothstep(u_laneLineWidth * 0.4, u_laneLineWidth * 0.5, centerDist);
    float period = u_dashLength + u_gapLength;
    float dashMod = mod(roadAlong, period);
    float dashMask = step(dashMod, u_dashLength);
    centerMask *= dashMask;

    // Edge lines (continuous)
    float edgeX = halfRW - u_edgeLineOffset;
    float edgeDistL = abs(roadDist + edgeX);
    float edgeDistR = abs(roadDist - edgeX);
    float edgeMaskL = 1.0 - smoothstep(u_laneLineWidth * 0.4, u_laneLineWidth * 0.5, edgeDistL);
    float edgeMaskR = 1.0 - smoothstep(u_laneLineWidth * 0.4, u_laneLineWidth * 0.5, edgeDistR);

    return max(centerMask, max(edgeMaskL, edgeMaskR));
}

// ── Asphalt with noise texture ───────────────────────────────────────────
vec3 asphaltColor(vec3 worldPos) {
    vec3 col = u_asphaltColor;

    // Fine-grained noise for asphalt texture
    float n1 = noise(worldPos.xz * u_asphaltNoiseScale * 10.0);
    float n2 = noise(worldPos.xz * u_asphaltNoiseScale * 25.0);
    float n  = n1 * 0.6 + n2 * 0.4;
    col += col * (n - 0.5) * u_asphaltNoiseStrength;

    float halfRW = u_roadWidth / 2.0;
    float lineMask = 0.0;

    if (u_gridSpacingX > 0.0) {
        // Grid mode: use modular arithmetic to find nearest road center
        float gsx = u_gridSpacingX;
        float gsz = u_gridSpacingZ;

        float modX = mod(worldPos.x - u_gridOriginX + gsx * 0.5, gsx) - gsx * 0.5;
        float modZ = mod(worldPos.z - u_gridOriginZ + gsz * 0.5, gsz) - gsz * 0.5;

        bool onVertRoad = abs(modX) < halfRW;
        bool onHorzRoad = abs(modZ) < halfRW;
        bool isIntersection = onVertRoad && onHorzRoad;

        if (!isIntersection) {
            if (onVertRoad) {
                // Road runs along Z: modX = perpendicular dist, worldPos.z = along road
                lineMask = laneMarkings(modX, worldPos.z);
            }
            if (onHorzRoad) {
                // Road runs along X: modZ = perpendicular dist, worldPos.x = along road
                lineMask = max(lineMask, laneMarkings(modZ, worldPos.x));
            }
        }
    } else {
        // Single-road mode: road centered at x=0, running along Z
        lineMask = laneMarkings(worldPos.x, worldPos.z);
    }

    col = mix(col, u_lineColor, lineMask);

    return col;
}

// ── Curb color with slight noise ─────────────────────────────────────────
vec3 curbColor(vec3 worldPos) {
    vec3 col = u_curbColor;
    float n = noise(worldPos.xz * 8.0);
    col += col * (n - 0.5) * 0.08;
    return col;
}

// ── Sidewalk color with joint pattern ────────────────────────────────────
vec3 sidewalkColor(vec3 worldPos) {
    vec3 col = u_sidewalkColor;

    // Slight concrete noise
    float n = noise(worldPos.xz * 6.0);
    col += col * (n - 0.5) * 0.06;

    // Grid joint pattern
    vec2 grid = worldPos.xz / u_jointSpacing;
    vec2 f = fract(grid);
    float jointX = smoothstep(0.0, u_jointWidth, f.x) * smoothstep(0.0, u_jointWidth, 1.0 - f.x);
    float jointZ = smoothstep(0.0, u_jointWidth, f.y) * smoothstep(0.0, u_jointWidth, 1.0 - f.y);
    float isJoint = 1.0 - jointX * jointZ;

    col = mix(col, u_jointColor, isJoint);

    return col;
}

void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(u_sunDir);

    // Branchless surface-type selection: 0=asphalt, 1=curb, 2=sidewalk
    float isCurb     = step(0.5, vSurfaceType) * (1.0 - step(1.5, vSurfaceType));  // type 1
    float isSidewalk = step(1.5, vSurfaceType);                                      // type 2
    float isAsphalt  = 1.0 - isCurb - isSidewalk;                                    // type 0

    vec3 asphalt = asphaltColor(vWorldPos);
    vec3 curb    = curbColor(vWorldPos);
    vec3 sidewalk = sidewalkColor(vWorldPos);

    vec3 baseColor = asphalt  * isAsphalt
                   + curb     * isCurb
                   + sidewalk * isSidewalk;

    // Diffuse (Lambertian) lighting
    float diffuse = max(dot(N, L), 0.0);
    float lit     = u_ambientStrength + (1.0 - u_ambientStrength) * diffuse;

    vec3 color = baseColor * lit * u_sunColor;

    gl_FragColor = vec4(color, 1.0);
}
