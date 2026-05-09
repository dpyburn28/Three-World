window.DitherEffect = class DitherEffect extends PostProcessEffect {
    constructor(options = {}) {
        super();
        this.name = 'Dither';
        this.options = { enabled: true, ...options };
    }

    async load(ctx) {
        const shader = await loadShaderFromDirectory('shaders/dither');
        this.shader = shader;

        this.pass = new THREE.ShaderPass({
            vertexShader:   shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            uniforms: {
                tDiffuse:         { value: null },
                u_resolution:     { value: new THREE.Vector2(innerWidth, innerHeight) },
                u_ditherScale:    { value: 8.0 },
                u_ditherStrength: { value: 1.0 },
                u_keepColor:      { value: 0.0 }, // NEW
            },
        });

        this.pass.enabled = this.options.enabled;
        ctx.composer.addPass(this.pass);
    }

    setupGui(folder, ctx) {
        this._toggleParams = { enabled: this.pass.enabled };
        folder.addBinding(this._toggleParams, 'enabled', { label: 'Enabled' })
            .on('change', ({ value }) => { this.pass.enabled = value; });

        this._shaderControls = new ShaderControls(
            folder,
            this.shader.controls,
            this.pass.uniforms,
            this.shader.dirPath
        );
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