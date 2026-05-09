window.MyObject = class MyObject extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'My Object'; // must match the key used in scene preset .json

        this.options = {
            // default construction options here
            // these are init-time values, not runtime params
            exampleOption: 1.0,
            ...options,
        };
    }

    async load(ctx) {
        // --- Load shader ---
        const shader = await loadShaderFromDirectory('shaders/myShader');
        this.shader = shader;

        // --- Material ---
        this.mat = new THREE.ShaderMaterial({
            vertexShader:   shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            uniforms: {
                // globals — auto-updated by SceneManager
                u_time:       { value: 0 },
                u_resolution: { value: new THREE.Vector2(innerWidth, innerHeight) },
                u_frame:      { value: 0 },

                // object-specific uniforms — should mirror controls.json defaults
                u_myParam: { value: this.options.exampleOption },
            },
        });

        // --- Geometry + Mesh ---
        const geo = new THREE.BoxGeometry(); // replace with actual geo
        this.mesh = new THREE.Mesh(geo, this.mat);
        ctx.scene.add(this.mesh);

        // --- Event listeners ---
        // store bound refs so they can be removed in dispose()
        // this._onMouseMove = (e) => { ... };
        // window.addEventListener('mousemove', this._onMouseMove);
    }

    setupGui(folder, ctx) {
        // --- Shader controls (auto-wired from controls.json) ---
        this._shaderControls = new ShaderControls(
            folder,
            this.shader.controls,
            this.mat.uniforms
        );

        // --- Intercept any uniforms that need side effects ---
        // e.g. uniforms that require a geometry rebuild, texture reload, etc.
        // const binding = this._shaderControls.bindings.find(b => b.key === 'u_myParam');
        // if (binding) {
        //     binding.dispose();
        //     folder.addBinding(this._shaderControls.params, 'u_myParam', {
        //         label: 'My Param', min: 0, max: 1, step: 0.01,
        //     }).on('change', ({ value }) => {
        //         this.mat.uniforms.u_myParam.value = value;
        //         this._rebuildSomething();
        //     });
        // }

        // --- Non-uniform params ---
        // this.myParams = { exampleParam: this.options.exampleOption };
        // this._myBindings = [
        //     folder.addBinding(this.myParams, 'exampleParam', { min: 0, max: 10, step: 0.1 })
        //         .on('change', ({ value }) => { /* apply */ }),
        // ];
    }

    // Snapshot all controllable state — called by ScenePresetManager
    collectParams() {
        return {
            shader: this._shaderControls?.collectParams() ?? {},
            // include any non-uniform param groups here
            // myParams: { ...this.myParams },
        };
    }

    // Restore state from a snapshot — called by ScenePresetManager
    applyParams(data) {
        if (data.shader && this._shaderControls) {
            this._shaderControls.applyParams(data.shader);
        }
        // if (data.myParams) {
        //     Object.assign(this.myParams, data.myParams);
        //     this._applyMyParams();
        //     for (const b of this._myBindings ?? []) b.refresh();
        // }
    }

    preFrame(ctx) {
        // u_time / u_resolution / u_frame auto-updated by SceneManager
        // add any per-frame object logic here
    }

    draw(ctx) {
        // per-frame draw logic (mesh transforms etc.)
    }

    dispose(ctx) {
        // window.removeEventListener('mousemove', this._onMouseMove);
        this._shaderControls?.dispose();
        this.mesh?.geometry.dispose();
        this.mat?.dispose();
        ctx.scene.remove(this.mesh);
    }
}