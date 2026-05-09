#include "../_common/math.glsl"
#include "../_common/color.glsl"

// ── Varyings ────────────────────────────────────────────────────────────
varying vec3  vWorldPos;
varying vec3  vNormal;
varying vec3  vShaftTangent;
varying float vU;   // 0 = base (calamus), 1 = tip
varying float vV;   // -1 = left edge, +1 = right edge

// ── Color ───────────────────────────────────────────────────────────────
uniform vec3  u_baseColor;
uniform vec3  u_tipColor;
uniform float u_tipBlend;
uniform vec3  u_shaftColor;
uniform float u_shaftWidth;

// ── Barbs ───────────────────────────────────────────────────────────────
uniform float u_barbDensity;
uniform float u_barbStrength;
uniform float u_barbSlant;
uniform float u_barbGap;

// ── Iridescence ─────────────────────────────────────────────────────────
uniform float u_iridescentStrength;
uniform float u_iridescentHue;
uniform float u_iridescentSpread;

// ── Translucency ────────────────────────────────────────────────────────
uniform float u_translucentStrength;
uniform vec3  u_translucentColor;

// ── Lighting ────────────────────────────────────────────────────────────
uniform vec3  u_lightDir;
uniform vec3  u_lightColor;
uniform float u_ambientStrength;
uniform float u_specularPow;
uniform float u_specularStrength;
uniform float u_shaftGloss;

// ── Edge ────────────────────────────────────────────────────────────────
uniform float u_edgeFade;

void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(u_lightDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);
    vec3 T = normalize(vShaftTangent);

    float absV = abs(vV);

    // ── Base color with tip gradient ──────────────────────────────────
    float tipT = smoothstep(1.0 - u_tipBlend, 1.0, vU);
    vec3 col = mix(u_baseColor, u_tipColor, tipT);

    // ── Shaft (rachis) ───────────────────────────────────────────────
    // Wider, softer mask so shaft blends gradually into vane
    float shaftMask = 1.0 - smoothstep(u_shaftWidth * 0.3, u_shaftWidth * 1.2, absV);

    // Shaft color with internal detail
    vec3 shaftCol = u_shaftColor;
    // Lighten toward tip (real shafts thin and pale distally)
    shaftCol = mix(shaftCol * 0.9, shaftCol, smoothstep(0.0, 0.5, vU));
    // Bright center highlight — glossy ridge of the quill
    float centerLine = 1.0 - smoothstep(0.0, u_shaftWidth * 0.2, absV);
    shaftCol += vec3(0.06) * centerLine;
    // Dark edge grooves where barbs insert into the rachis
    float shaftEdge = smoothstep(u_shaftWidth * 0.4, u_shaftWidth * 0.7, absV)
                    * (1.0 - smoothstep(u_shaftWidth * 0.7, u_shaftWidth * 1.2, absV));
    shaftCol *= 1.0 - shaftEdge * 0.3;

    col = mix(col, shaftCol, shaftMask);

    // ── Shaft cylindrical normal ────────────────────────────────────
    // Bend surface normal in shaft region to simulate a round tube
    vec3 crossShaft = normalize(cross(N, T));
    float shaftT = clamp(vV / max(0.001, u_shaftWidth), -1.0, 1.0);
    vec3 shaftN = normalize(N + crossShaft * shaftT * 1.2);
    N = normalize(mix(N, shaftN, shaftMask));

    // ── Barb lines ──────────────────────────────────────────────────
    // Variable slant: steeper near base, more perpendicular near tip
    float slant = u_barbSlant * (1.0 - vU * 0.5);
    // Curved barbs: quadratic offset makes barbs arc from shaft to edge
    float curvedV = absV * absV;
    float barbPhase = (vU - curvedV * slant) * u_barbDensity;
    // Add per-barb variation using noise seeded by position along shaft
    float barbNoise = hash1(vec2(floor(barbPhase), 7.31)) * 0.5;
    float barb = sin(barbPhase * 6.28318) * 0.5 + 0.5;
    barb = mix(barb, barbNoise, 0.3);
    // Darken/lighten alternating barbs — suppress on shaft, fade toward edges
    float barbEdgeFade = 1.0 - smoothstep(0.6, 1.0, absV);
    float barbEffect = (barb - 0.5) * u_barbStrength * (1.0 - shaftMask) * barbEdgeFade;
    col *= 1.0 + barbEffect;

    // ── Lighting ─────────────────────────────────────────────────────
    float NdotL = dot(N, L);
    float diffuse = max(0.0, NdotL);
    float NdotH = max(0.0, dot(N, H));
    float spec = pow(NdotH, u_specularPow) * u_specularStrength;

    // ── Shaft anisotropic specular (Kajiya-Kay) ─────────────────────
    // Lengthwise highlight on the shaft like a glossy quill
    float TdotH = dot(T, H);
    float sinTH = sqrt(max(0.001, 1.0 - TdotH * TdotH));
    float anisoSpec = pow(sinTH, u_specularPow * 0.5) * u_shaftGloss;
    spec += anisoSpec * shaftMask;

    vec3 lit = col * (u_ambientStrength + diffuse * (1.0 - u_ambientStrength));
    lit += u_lightColor * spec;

    // ── Translucency (backlit glow) ──────────────────────────────────
    float backlight = max(0.0, dot(-N, L));
    // Stronger at vane edges where feather is thinnest
    float edgeThinness = smoothstep(0.0, 0.6, absV);
    float transmission = backlight * edgeThinness * u_translucentStrength;
    lit += u_translucentColor * transmission;

    // ── Iridescence ──────────────────────────────────────────────────
    float NdotV = max(0.0, dot(N, V));
    float iriHue = u_iridescentHue + NdotV * u_iridescentSpread;
    vec3 iriColor = hsb2rgb(vec3(iriHue, 0.7, 1.0));
    // Apply iridescence, reduced on shaft
    float iriMask = u_iridescentStrength * (1.0 - shaftMask * 0.7);
    lit = mix(lit, lit * iriColor, iriMask);

    // ── Barb gap transparency ────────────────────────────────────────
    // Make spaces between barbs transparent; keep shaft opaque
    float barbAlpha = mix(1.0, smoothstep(0.0, 0.3, barb), u_barbGap);
    barbAlpha = mix(barbAlpha, 1.0, shaftMask);

    // ── Edge fade (alpha) ────────────────────────────────────────────
    float alpha = smoothstep(0.0, max(0.001, u_edgeFade), 1.0 - absV);
    alpha *= barbAlpha;

    gl_FragColor = vec4(lit, alpha);
}
