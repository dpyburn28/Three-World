/**
 * ShaderHandle — standalone shader handler/controller.
 *
 * Manages one shader's full lifecycle: loading, uniform building,
 * material creation, GUI wiring, preset collect/apply, and disposal.
 *
 * SceneObjects compose one or more ShaderHandles — they are NOT scene objects
 * themselves. This allows a single scene object to manage multiple shaders.
 *
 * Usage:
 *   const sky = new ShaderHandle('shaders/sky');
 *   await sky.load({ side: THREE.BackSide, depthWrite: false });
 *   const mesh = new THREE.Mesh(geo, sky.mat);
 *
 *   sky.setupGui(folder);
 *   sky.collectParams();
 *   sky.applyParams(data);
 *   sky.dispose();
 */
window.ShaderHandle = class ShaderHandle {

    /**
     * @param {string} dirPath - shader directory (e.g. 'shaders/sky')
     */
    constructor(dirPath) {
        this.dirPath = dirPath;
        this.shader = null;
        this.mat = null;
        this._shaderControls = null;
    }

    /**
     * Loads the shader, auto-builds uniforms, and creates the ShaderMaterial.
     *
     * @param {Object} opts
     * @param {Object} [opts.uniforms] - { u_name: value } overrides for textures, specific types
     *   Everything else (side, depthWrite, transparent, ...) is passed to ShaderMaterial.
     */
    async load(opts = {}) {
        const { uniforms: overrides, ...materialOpts } = opts;

        this.shader = await loadShaderFromDirectory(this.dirPath);
        const uniforms = buildUniforms(this.shader.uniformMeta, this.shader.controls, overrides);

        this.mat = new THREE.ShaderMaterial({
            vertexShader:   this.shader.vertexShader,
            fragmentShader: this.shader.fragmentShader,
            uniforms,
            ...materialOpts,
        });
    }

    /** Creates ShaderControls GUI bindings inside the given Tweakpane folder. */
    setupGui(folder) {
        this._shaderControls = new ShaderControls(
            folder,
            this.shader.controls,
            this.mat.uniforms,
            this.shader.dirPath
        );
    }

    /** Returns current uniform values for preset saving. */
    collectParams() {
        return this._shaderControls?.collectParams() ?? {};
    }

    /** Restores uniform values from a preset snapshot. */
    applyParams(data) {
        this._shaderControls?.applyParams(data);
    }

    /** Disposes ShaderControls and the material. Geometry/mesh are the caller's responsibility. */
    dispose() {
        this._shaderControls?.dispose();
        this.mat?.dispose();
    }
}
