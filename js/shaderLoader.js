
/**
 * Recursively resolves all #include directives inside a shader source string.
 * 
 * @param {string} source     - GLSL source code
 * @param {string} parentUrl  - Absolute URL of the file containing this source. Used to resolve realtive include paths correctly.
 * @returns {Promise<string>} - Source code with all includes expanded inline
 */
async function resolveIncludes(source, parentUrl) {
    const includeRegex = /^\s*#include\s+"(.+?)"\s*$/gm;

    let result = source;
    let match;
    
    // Iterate through all include statements in the source
    while ((match = includeRegex.exec(source)) !== null) {

        // Extract the relative path inside the quotes
        const includeRelativePath = match[1];

        // Resolve relative to the shader file location
        const includeUrl = new URL(includeRelativePath, parentUrl).href;

        // Fetch the included file's contents
        const includedSrc = await fetch(includeUrl).then(r => {
            if (!r.ok) {
                throw new Error(`Failed to load include: ${includeUrl}`);
            }
            return r.text();
        });

        // Recursively resolve nested includes
        const resolvedIncluded = await resolveIncludes(includedSrc, includeUrl);

        // Replace the original #include line with the fully expanded code
        result = result.replace(match[0], resolvedIncluded);
    }

    return result;
}

// loadShadersWithIncludes — returns shaders as source strings with #include directives resolved
async function loadShadersWithIncludes(vertexPath, fragmentPath) {
    const vertUrl = new URL(vertexPath, window.location.href).href;
    const fragUrl = new URL(fragmentPath, window.location.href).href;

    const vertSource = await fetch(vertUrl).then(r => r.text());
    const fragSource = await fetch(fragUrl).then(r => r.text());

    const vertexShader   = await resolveIncludes(vertSource, vertUrl);
    const fragmentShader = await resolveIncludes(fragSource, fragUrl);

    return { vertexShader, fragmentShader };
}

// ── Uniform parsing & building ──────────────────────────────────────────────

/**
 * Parses all `uniform TYPE NAME;` declarations from resolved GLSL source.
 * Returns a map: { u_name: { type: 'float' }, u_windDir: { type: 'vec2' }, ... }
 * Array uniforms (e.g. vec4 u_colliders[8]) are excluded — provide via overrides.
 */
function parseUniformsGlsl(source) {
    const re = /^\s*uniform\s+(float|int|bool|vec[234]|ivec[234]|mat[34]|sampler2D|samplerCube)\s+(\w+)\s*;/gm;
    const meta = {};
    let m;
    while ((m = re.exec(source)) !== null) {
        meta[m[2]] = { type: m[1] };
    }
    return meta;
}

/**
 * Maps a GLSL type string to a sensible THREE.js zero-default value.
 */
function glslTypeDefault(glslType) {
    switch (glslType) {
        case 'float': case 'int':         return 0;
        case 'bool':                      return false;
        case 'vec2':                      return new THREE.Vector2();
        case 'vec3':                      return new THREE.Vector3();
        case 'vec4':                      return new THREE.Vector4();
        case 'ivec2':                     return new THREE.Vector2();
        case 'ivec3':                     return new THREE.Vector3();
        case 'ivec4':                     return new THREE.Vector4();
        case 'mat3':                      return new THREE.Matrix3();
        case 'mat4':                      return new THREE.Matrix4();
        case 'sampler2D': case 'samplerCube': return null;
        default:                          return 0;
    }
}

/**
 * Converts a controls.json entry's value into the correct THREE.js type.
 */
function controlsValueToThree(def) {
    const v = def.value;
    if (v === undefined || v === null) return v;
    switch (def.type) {
        case 'color':
            return new THREE.Color(v.r / 255, v.g / 255, v.b / 255);
        case 'vec4color':
            return new THREE.Vector4(v.r / 255, v.g / 255, v.b / 255, 1.0);
        case 'vec2':
            return new THREE.Vector2(v.x, v.y);
        case 'vec3':
            return new THREE.Vector3(v.x, v.y, v.z);
        case 'vec4':
            return new THREE.Vector4(v.x, v.y, v.z, v.w);
        default:
            return v; // scalar (float, int, bool)
    }
}

/**
 * Builds a complete THREE.js uniforms object from three sources (lowest to highest priority):
 *   1. GLSL-parsed zero-defaults (uniformMeta)
 *   2. controls.json values (controls)
 *   3. Explicit overrides — values (not wrapped in {value:...})
 *
 * @param {Object} uniformMeta  - { u_name: { type: 'float' }, ... } from parseUniformsGlsl
 * @param {Object|null} controls - parsed controls.json or null
 * @param {Object} overrides     - { u_name: threeValue, ... } raw values (not {value:...})
 * @returns {Object} THREE.js uniforms: { u_name: { value: ... }, ... }
 */
function buildUniforms(uniformMeta, controls, overrides = {}) {
    const uniforms = {};

    // Layer 1: GLSL zero-defaults
    for (const [name, info] of Object.entries(uniformMeta)) {
        uniforms[name] = { value: glslTypeDefault(info.type) };
    }

    // Layer 2: controls.json values
    if (controls) {
        for (const [name, def] of Object.entries(controls)) {
            const val = controlsValueToThree(def);
            if (val !== undefined && val !== null) {
                uniforms[name] = { value: val };
            }
        }
    }

    // Layer 3: explicit overrides (highest priority)
    for (const [name, val] of Object.entries(overrides)) {
        uniforms[name] = { value: val };
    }

    return uniforms;
}

/**
 * Loads a shader from a directory by automatically detecting vertex and fragment shader files based on common naming conventions.
 * 
 * Supported filename:
 *  - Vertex shaders: vert.glsl, vertex.glsl, shader.vert
 *  - Fragment shaders: frag.glsl, fragment.glsl, shader.frag
 * 
 * @param {string} dirPath - Path to shader directory
 * @returns {Promise<p5.Shader>}
 */
async function loadShaderFromDirectory(dirPath) {
    // Ensure directory ends without trailing slash
    dirPath = dirPath.replace(/\/$/, '');

    const vertexCandidates = [
        'vert.glsl',
        'vertex.glsl',
        'shader.vert'
    ]

    const fragmentCandidates = [
        'frag.glsl',
        'fragment.glsl',
        'shader.frag'
    ]

    let foundVertex = null;
    let foundFragment = null;

    /**
     * Attempts to fetch a file
     * @param {string} path  - URL of the file to check
     * @returns {Promise<boolean>} - True if file exists, false otherwise
     */
    async function fileExists(path) {
        try {
            const res = await fetch(path, { method: 'HEAD' });
            return res.ok;
        } catch {
            return false;
        }
    }

    // Search for vertex shader
    for (const file of vertexCandidates) {
        const fullPath = `${dirPath}/${file}`;
        if (await fileExists(fullPath)) {
            foundVertex = fullPath;
            break;
        }
    }

    // Search for fragment shader
    for (const file of fragmentCandidates) {
        const fullPath = `${dirPath}/${file}`;
        if (await fileExists(fullPath)) {
            foundFragment = fullPath;
            break;
        }
    }

    // Validate results
    if (!foundVertex) {
        throw new Error(`No vertex shader found in ${dirPath}.`);
    }

    if (!foundFragment) {
        throw new Error(`No fragment shader found in ${dirPath}.`);
    }

    // Load shaders with include support
    const shaders = await loadShadersWithIncludes(foundVertex, foundFragment);

    // Parse uniform declarations from both resolved shaders
    // (includes are already expanded, so this captures uniforms from uniforms.glsl etc.)
    // Merge both to handle cases where uniforms are in vert, frag, or both
    const vertMeta = parseUniformsGlsl(shaders.vertexShader);
    const fragMeta = parseUniformsGlsl(shaders.fragmentShader);
    const uniformMeta = { ...vertMeta, ...fragMeta };

    // Search for controls
    let controls = null;
    const controlsPath = `${dirPath}/controls.json`;
    if (await fileExists(controlsPath)) {
        controls = await fetch(controlsPath).then(r => r.json());
    }

    return { ...shaders, controls, uniformMeta, dirPath }
}

