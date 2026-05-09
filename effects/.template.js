window.MyEffect = class MyEffect extends PostProcessEffect {
    constructor(options = {}) {
        super();
        this.name = 'My Effect'; // must match key used in scene preset .json

        this.options = {
            enabled: true,
            // init-time options here (not runtime params)
            ...options,
        };
    }

    async load(ctx) {
        const shader = await loadShaderFromDirectory('shaders/myEffect');
        this.shader = shader;

        this.pass = new THREE.ShaderPass({
            vertexShader:   shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            uniforms: {
                tDiffuse:     { value: null },  // filled by composer automatically

                // globals — auto-updated by SceneManager
                u_time:       { value: 0 },
                u_resolution: { value: new THREE.Vector2(innerWidth, innerHeight) },
                u_frame:      { value: 0 },

                // effect-specific uniforms — mirror controls.json defaults
                u_myParam:    { value: 1.0 },
            },
        });

        this.pass.enabled = this.options.enabled;
        ctx.composer.addPass(this.pass);

        // ── If your effect needs a custom pass instead of ShaderPass ─────────
        // (e.g. ping-pong accumulation, multi-target, etc.)
        // See effects/datamosh.js for a custom THREE.Pass example.
    }

    setupGui(folder, ctx) {
        // Enabled toggle — always first
        this._toggleParams = { enabled: this.pass.enabled };
        folder.addBinding(this._toggleParams, 'enabled', { label: 'Enabled' })
            .on('change', ({ value }) => { this.pass.enabled = value; });

        // Shader controls auto-wired from controls.json
        this._shaderControls = new ShaderControls(
            folder,
            this.shader.controls,
            this.pass.uniforms
        );

        // --- Intercept uniforms with side effects ---
        // const binding = this._shaderControls.bindings.find(b => b.key === 'u_myParam');
        // if (binding) {
        //     binding.dispose();
        //     folder.addBinding(this._shaderControls.params, 'u_myParam', {
        //         label: 'My Param', min: 0, max: 1, step: 0.01,
        //     }).on('change', ({ value }) => {
        //         this.pass.uniforms.u_myParam.value = value;
        //         this._doSomethingExtra();
        //     });
        // }
    }

    collectParams() {
        return {
            enabled: this._toggleParams?.enabled ?? this.pass.enabled,
            shader:  this._shaderControls?.collectParams() ?? {},
        };
    }

    applyParams(data) {
        if (data.enabled !== undefined) {
            this._toggleParams.enabled = data.enabled;
            this.pass.enabled = data.enabled;
        }
        if (data.shader && this._shaderControls) {
            this._shaderControls.applyParams(data.shader);
        }
    }

    dispose(ctx) {
        this._shaderControls?.dispose();
        const idx = ctx.composer.passes.indexOf(this.pass);
        if (idx !== -1) ctx.composer.passes.splice(idx, 1);
        this.pass.material?.dispose();
    }
}